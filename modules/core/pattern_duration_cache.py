"""
Pattern Duration Cache Module

Calculates and caches estimated pattern durations based on actual coordinate distances.
Runs as a background task to avoid blocking main application operations.
"""

import os
import json
import math
import threading
import time
from typing import Dict, Optional
import logging
from modules.core.state import state

logger = logging.getLogger(__name__)

# Default cache file location
CACHE_FILE = "pattern_duration_cache.json"

class PatternDurationCache:
    """Manages pattern duration calculations and caching."""

    def __init__(self, patterns_dir: str, cache_file: str = CACHE_FILE):
        self.patterns_dir = patterns_dir
        self.cache_file = cache_file
        self.cache: Dict[str, Dict[int, float]] = {}  # {pattern_name: {speed: duration_seconds}}
        self.lock = threading.RLock()  # Use RLock (reentrant) to avoid deadlock
        self.calculation_thread: Optional[threading.Thread] = None
        self.is_calculating = False
        self.is_paused = False
        self.should_stop = False
        self.total_patterns = 0
        self.calculated_patterns = 0

        # Load existing cache
        self._load_cache()

    def _load_cache(self):
        """Load cache from disk."""
        try:
            if os.path.exists(self.cache_file):
                with open(self.cache_file, 'r') as f:
                    loaded = json.load(f)
                    # Convert string keys back to integers for speed
                    # Handle both "100" and "100.0" by converting to float first, then int
                    self.cache = {
                        pattern: {int(float(speed)): duration for speed, duration in speeds.items()}
                        for pattern, speeds in loaded.items()
                    }
                logger.info(f"Loaded pattern duration cache with {len(self.cache)} patterns")
        except Exception as e:
            logger.error(f"Error loading pattern duration cache: {e}")
            self.cache = {}

    def _save_cache(self):
        """Save cache to disk."""
        try:
            with self.lock:
                with open(self.cache_file, 'w') as f:
                    json.dump(self.cache, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving pattern duration cache: {e}")

    def _convert_polar_to_machine(self, prev_theta: float, prev_rho: float,
                                    curr_theta: float, curr_rho: float) -> tuple[float, float]:
        """
        Convert polar coordinate deltas to machine coordinate increments in mm.
        Uses the same conversion logic as pattern_manager._move_polar_sync including offset.

        Args:
            prev_theta, prev_rho: Previous polar coordinates
            curr_theta, curr_rho: Current polar coordinates

        Returns:
            Tuple of (x_increment_mm, y_increment_mm) machine coordinate deltas
        """
        # Use scaling factors based on table type (from pattern_manager.py line 504-509)
        if state.table_type == 'dune_weaver_mini':
            x_scaling_factor = 2
            y_scaling_factor = 3.7
        else:
            x_scaling_factor = 2
            y_scaling_factor = 5

        # Calculate deltas (from pattern_manager.py line 511-514)
        delta_theta = curr_theta - prev_theta
        delta_rho = curr_rho - prev_rho
        x_increment = delta_theta * 100 / (2 * math.pi * x_scaling_factor)
        y_increment = delta_rho * 100 / y_scaling_factor

        # Apply offset calculation (from pattern_manager.py line 516-524)
        x_total_steps = state.x_steps_per_mm * (100 / x_scaling_factor)
        y_total_steps = state.y_steps_per_mm * (100 / y_scaling_factor)

        offset = x_increment * (x_total_steps * x_scaling_factor / (state.gear_ratio * y_total_steps * y_scaling_factor))

        if state.table_type == 'dune_weaver_mini' or state.y_steps_per_mm == 546:
            y_increment -= offset
        else:
            y_increment += offset

        return x_increment, y_increment

    def _calculate_pattern_duration(self, pattern_path: str, speed: int) -> Optional[float]:
        """
        Calculate estimated duration for a pattern at a given speed.

        Args:
            pattern_path: Path to the .thr pattern file
            speed: Ball speed setting (mm/min, matches G-code F parameter)

        Returns:
            Estimated duration in seconds, or None if calculation fails
        """
        try:
            coordinates = []
            with open(pattern_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    parts = line.split()
                    if len(parts) >= 2:
                        try:
                            theta = float(parts[0])
                            rho = float(parts[1])
                            coordinates.append((theta, rho))
                        except ValueError:
                            continue

            if len(coordinates) < 2:
                return None

            pattern_name = os.path.basename(pattern_path)

            # Calculate total distance in mm by converting each coordinate pair
            # to machine increments and measuring the Euclidean distance
            total_distance_mm = 0.0
            for i in range(1, len(coordinates)):
                prev_theta, prev_rho = coordinates[i-1]
                curr_theta, curr_rho = coordinates[i]

                # Get machine coordinate increments (includes offset calculation)
                x_increment, y_increment = self._convert_polar_to_machine(
                    prev_theta, prev_rho, curr_theta, curr_rho
                )

                # Calculate Euclidean distance for this movement
                distance_mm = math.sqrt(x_increment ** 2 + y_increment ** 2)
                total_distance_mm += distance_mm

            num_points = len(coordinates)

            if speed > 0:
                # Calculate base duration: distance / speed
                # Speed is in mm/min (G-code F parameter), so convert to seconds
                base_duration_seconds = (total_distance_mm / speed) * 60

                # Add overhead for acceleration/deceleration as a percentage of movement time
                # Using 15% overhead factor to account for acceleration/deceleration between points
                overhead_factor = 1.15
                total_duration = base_duration_seconds * overhead_factor

                logger.info(f"Pattern {pattern_name}: {num_points} points, speed={speed} mm/min, "
                           f"distance={total_distance_mm:.2f} mm, "
                           f"base_time={base_duration_seconds:.1f}s, "
                           f"total={total_duration:.1f}s ({total_duration/60:.1f}m)")

                return total_duration

            return None

        except Exception as e:
            logger.error(f"Error calculating duration for {pattern_path}: {e}")
            return None

    def get_duration(self, pattern_name: str, speed: int) -> Optional[str]:
        """
        Get formatted duration string for a pattern at a given speed.

        Args:
            pattern_name: Name of the pattern file (without path)
            speed: Speed setting

        Returns:
            Formatted duration string (e.g., "5m", "1h 15m") or None if not available
        """
        with self.lock:
            if pattern_name in self.cache and speed in self.cache[pattern_name]:
                # Check if pattern file has been modified since cache was created
                try:
                    pattern_path = os.path.join(self.patterns_dir, pattern_name)
                    if os.path.exists(pattern_path):
                        pattern_mtime = os.path.getmtime(pattern_path)
                        # Check if cache entry has mtime info (new format)
                        cache_entry = self.cache[pattern_name]
                        if isinstance(cache_entry, dict) and '_mtime' in cache_entry:
                            cached_mtime = cache_entry['_mtime']
                            # If pattern file is newer, invalidate cache
                            if pattern_mtime > cached_mtime:
                                logger.debug(f"Pattern {pattern_name} modified (mtime: {pattern_mtime} > {cached_mtime}), invalidating duration cache")
                                return None
                        # If no mtime info, assume cache is valid for now
                        # (will be updated when recalculated)

                        duration_seconds = cache_entry.get(speed) if isinstance(cache_entry, dict) else cache_entry
                        if duration_seconds:
                            return self._format_duration(duration_seconds)
                except Exception as e:
                    logger.debug(f"Error checking mtime for {pattern_name}: {e}")
                    # Fall through to return cached value if mtime check fails
                    duration_seconds = self.cache[pattern_name][speed]
                    return self._format_duration(duration_seconds)
        return None

    def _format_duration(self, seconds: float) -> str:
        """Format duration in seconds to human-readable string."""
        if seconds < 60:
            return "<1m"
        elif seconds < 3600:
            minutes = round(seconds / 60)
            return f"{minutes}m"
        else:
            hours = int(seconds // 3600)
            minutes = round((seconds % 3600) / 60)
            if minutes > 0:
                return f"{hours}h {minutes}m"
            return f"{hours}h"

    def pause(self):
        """Pause the background calculation."""
        with self.lock:
            if self.is_calculating and not self.is_paused:
                self.is_paused = True
                logger.info("Pattern duration calculation paused")
                return True
            return False

    def resume(self):
        """Resume the background calculation."""
        with self.lock:
            if self.is_calculating and self.is_paused:
                self.is_paused = False
                logger.info("Pattern duration calculation resumed")
                return True
            return False

    def stop(self):
        """Stop the background calculation."""
        with self.lock:
            if self.is_calculating:
                self.should_stop = True
                self.is_paused = False
                logger.info("Pattern duration calculation stop requested")
                return True
            return False

    def clear_cache(self):
        """Clear all cached durations."""
        with self.lock:
            self.cache = {}
            self.calculated_patterns = 0
            self.total_patterns = 0
            # Don't reset is_calculating/is_paused/should_stop as those are managed by the worker thread
            self._save_cache()
            logger.info("Pattern duration cache cleared")

    def get_status(self) -> dict:
        """Get current calculation status."""
        with self.lock:
            return {
                'is_calculating': self.is_calculating,
                'is_paused': self.is_paused,
                'total_patterns': self.total_patterns,
                'calculated_patterns': self.calculated_patterns,
                'cache_size': len(self.cache)
            }

    def calculate_all_patterns_async(self, speeds: list = None):
        """
        Start background calculation for all patterns.

        Args:
            speeds: List of speeds to calculate for (default: [100])
        """
        if self.is_calculating:
            logger.info("Pattern duration calculation already in progress")
            return

        if speeds is None:
            speeds = [100]  # Default speed

        def calculation_worker():
            # Import state at the top of the worker function
            import concurrent.futures
            from modules.core.state import state

            self.is_calculating = True
            self.should_stop = False
            self.is_paused = False
            try:
                logger.info("Starting background pattern duration calculation")
                logger.info(f"Machine characteristics: table_type={state.table_type}, "
                           f"x_steps_per_mm={state.x_steps_per_mm}, y_steps_per_mm={state.y_steps_per_mm}, "
                           f"gear_ratio={state.gear_ratio}")
                patterns_to_calculate = []

                # Find all .thr files
                for root, dirs, files in os.walk(self.patterns_dir):
                    for file in files:
                        if file.endswith('.thr'):
                            pattern_path = os.path.join(root, file)
                            pattern_name = file

                            # Check if we need to calculate for this pattern
                            needs_calc = False
                            with self.lock:
                                if pattern_name not in self.cache:
                                    self.cache[pattern_name] = {}
                                    needs_calc = True
                                else:
                                    for speed in speeds:
                                        if speed not in self.cache[pattern_name]:
                                            needs_calc = True
                                            break

                            if needs_calc:
                                patterns_to_calculate.append((pattern_name, pattern_path))

                with self.lock:
                    self.total_patterns = len(patterns_to_calculate)
                    self.calculated_patterns = 0

                logger.info(f"Found {len(patterns_to_calculate)} patterns to calculate")

                # Calculate durations using multithreading
                # Use configured worker count (no cap)
                max_workers = max(1, state.cache_worker_count)
                batch_size = max(10, len(patterns_to_calculate) // 10)

                logger.info(f"Using {max_workers} parallel workers for duration calculation")

                # Capture self reference and lock for closure
                cache_ref = self
                lock_ref = self.lock

                def _calculate_pattern_speeds(pattern_tuple):
                    """Calculate durations for all speeds for a single pattern."""
                    pattern_name, pattern_path = pattern_tuple
                    results = {}

                    for speed in speeds:
                        # Check if already cached
                        with lock_ref:
                            if pattern_name in cache_ref.cache and speed in cache_ref.cache.get(pattern_name, {}):
                                continue  # Already calculated

                        duration = cache_ref._calculate_pattern_duration(pattern_path, speed)
                        if duration is not None:
                            results[speed] = duration

                    # Get mtime
                    mtime = None
                    try:
                        mtime = os.path.getmtime(pattern_path)
                    except Exception as e:
                        logger.debug(f"Could not get mtime for {pattern_name}: {e}")

                    return (pattern_name, results, mtime)

                completed = 0
                for batch_start in range(0, len(patterns_to_calculate), batch_size):
                    # Check for stop before each batch
                    if self.should_stop:
                        logger.info("Pattern duration calculation stopped by user")
                        break

                    # Wait while paused
                    while self.is_paused and not self.should_stop:
                        time.sleep(0.1)

                    if self.should_stop:
                        logger.info("Pattern duration calculation stopped by user")
                        break

                    batch_end = min(batch_start + batch_size, len(patterns_to_calculate))
                    batch = patterns_to_calculate[batch_start:batch_end]

                    # Process batch in parallel
                    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                        futures = {executor.submit(_calculate_pattern_speeds, pattern): pattern for pattern in batch}

                        for future in concurrent.futures.as_completed(futures):
                            if self.should_stop:
                                # Cancel remaining futures
                                for f in futures:
                                    f.cancel()
                                break

                            try:
                                pattern_name, results, mtime = future.result()

                                # Store results
                                with self.lock:
                                    if pattern_name not in self.cache:
                                        self.cache[pattern_name] = {}
                                    for speed, duration in results.items():
                                        self.cache[pattern_name][speed] = duration
                                    if mtime is not None:
                                        self.cache[pattern_name]['_mtime'] = mtime

                                    completed += 1
                                    self.calculated_patterns = completed

                            except Exception as e:
                                pattern_name, _ = futures[future]
                                logger.error(f"Error calculating duration for {pattern_name}: {e}")

                    # Check stop after batch
                    if self.should_stop:
                        logger.info("Pattern duration calculation stopped by user")
                        break

                    # Save cache periodically (after each batch)
                    self._save_cache()
                    logger.info(f"Calculated durations for {completed}/{len(patterns_to_calculate)} patterns")

                # Final save
                self._save_cache()
                if not self.should_stop:
                    logger.info("Pattern duration calculation complete")

            except Exception as e:
                logger.error(f"Error in pattern duration calculation: {e}", exc_info=True)
            finally:
                self.is_calculating = False
                self.is_paused = False
                self.should_stop = False

        self.calculation_thread = threading.Thread(target=calculation_worker, daemon=True)
        self.calculation_thread.start()

    def calculate_single_pattern_async(self, pattern_path: str, speeds: list = None):
        """
        Calculate duration for a single pattern asynchronously.

        Args:
            pattern_path: Path to the pattern file
            speeds: List of speeds to calculate for (default: [100])
        """
        if speeds is None:
            speeds = [100]

        def calculation_worker():
            try:
                pattern_name = os.path.basename(pattern_path)
                logger.info(f"Calculating duration for new pattern: {pattern_name}")

                for speed in speeds:
                    duration = self._calculate_pattern_duration(pattern_path, speed)
                    if duration is not None:
                        with self.lock:
                            if pattern_name not in self.cache:
                                self.cache[pattern_name] = {}
                            self.cache[pattern_name][speed] = duration

                self._save_cache()
                logger.info(f"Completed duration calculation for {pattern_name}")

            except Exception as e:
                logger.error(f"Error calculating duration for {pattern_path}: {e}")

        thread = threading.Thread(target=calculation_worker, daemon=True)
        thread.start()


# Global instance
_cache_instance: Optional[PatternDurationCache] = None

def init_duration_cache(patterns_dir: str, speeds: list = None):
    """
    Initialize the global pattern duration cache and start background calculation.

    Args:
        patterns_dir: Directory containing pattern files
        speeds: List of speeds to calculate for (default: [100])
    """
    global _cache_instance
    try:
        logger.info(f"Initializing duration cache for directory: {patterns_dir}")
        _cache_instance = PatternDurationCache(patterns_dir)
        logger.info(f"Duration cache instance created, starting async calculation with speeds: {speeds}")
        _cache_instance.calculate_all_patterns_async(speeds)
        logger.info("Duration cache initialization complete")
        return _cache_instance
    except Exception as e:
        logger.error(f"Failed to initialize duration cache: {e}", exc_info=True)
        raise

def get_duration_cache() -> Optional[PatternDurationCache]:
    """Get the global pattern duration cache instance."""
    return _cache_instance

def calculate_new_pattern(pattern_path: str, speeds: list = None):
    """
    Calculate duration for a newly added pattern.

    Args:
        pattern_path: Path to the pattern file
        speeds: List of speeds to calculate for (default: [100])
    """
    if _cache_instance:
        _cache_instance.calculate_single_pattern_async(pattern_path, speeds)

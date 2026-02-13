#!/usr/bin/env python3
"""
Simple standalone web interface for sand table control.
Replicates the main Browse page design without navigation or add pattern features.
"""

import http.server
import socketserver
import os
import argparse
import re

# Parse command line arguments
parser = argparse.ArgumentParser(description='Simple sand table control interface')
parser.add_argument('--ip', type=str, default='0.0.0.0', help='IP address to bind to (default: 0.0.0.0)')
parser.add_argument('--port', type=int, default=9090, help='Port to bind to (default: 9090)')
args = parser.parse_args()

# Configuration
HOST = args.ip
PORT = args.port

# Read backend API host and port from main.py
def get_backend_config():
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        main_py_path = os.path.join(script_dir, 'main.py')

        with open(main_py_path, 'r') as f:
            content = f.read()
            # Look for uvicorn.run(app, host="...", port=...)
            match = re.search(r'uvicorn\.run\([^)]*host\s*=\s*["\']([^"\']+)["\'][^)]*port\s*=\s*(\d+)', content)
            if match:
                host = match.group(1)
                port = int(match.group(2))
                # If backend binds to 0.0.0.0, client should connect to 127.0.0.1
                if host == "0.0.0.0":
                    host = "127.0.0.1"
                return host, port
    except Exception as e:
        print(f"Warning: Could not read backend config from main.py: {e}")

    # Fallback to defaults
    return "127.0.0.1", 8080

API_HOST, API_PORT = get_backend_config()
API_BASE_URL = f"http://{API_HOST}:{API_PORT}"

HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sand Table Control</title>
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons|Material+Icons+Outlined" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        :root {
            --background: 240 10% 3.9%;
            --foreground: 0 0% 98%;
            --card: 240 10% 7%;
            --card-foreground: 0 0% 98%;
            --muted: 240 3.7% 15.9%;
            --muted-foreground: 240 5% 64.9%;
            --border: 240 3.7% 15.9%;
            --primary: 210 100% 50%;
            --primary-foreground: 0 0% 100%;
            --ring: 210 100% 50%;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: hsl(var(--background));
            color: hsl(var(--foreground));
            min-height: 100vh;
        }

        .container {
            max-width: 1120px;
            margin: 0 auto;
            padding: 1.5rem 1rem;
        }

        /* Header */
        .header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 1rem;
            margin-bottom: 1.5rem;
        }

        .header-content h1 {
            font-size: 1.25rem;
            font-weight: 600;
            margin-bottom: 0.125rem;
        }

        .header-content p {
            font-size: 0.75rem;
            color: hsl(var(--muted-foreground));
        }

        /* Filter Bar */
        .filter-bar {
            position: sticky;
            top: 0;
            z-index: 20;
            padding: 0.75rem 0;
            background: hsl(var(--background) / 0.95);
            backdrop-filter: blur(8px);
            margin-bottom: 1.5rem;
        }

        .filter-controls {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        /* Search Input */
        .search-wrapper {
            position: relative;
            flex: 1;
            min-width: 0;
        }

        .search-icon {
            position: absolute;
            left: 0.75rem;
            top: 50%;
            transform: translateY(-50%);
            color: hsl(var(--muted-foreground));
            pointer-events: none;
        }

        .search-input {
            width: 100%;
            height: 2.75rem;
            padding: 0 2.5rem 0 2.5rem;
            background: hsl(var(--card));
            border: 1px solid hsl(var(--border));
            border-radius: 9999px;
            color: hsl(var(--foreground));
            font-size: 0.875rem;
            outline: none;
            transition: all 0.2s;
        }

        .search-input:focus {
            border-color: hsl(var(--primary));
            ring: 2px;
            ring-color: hsl(var(--ring));
        }

        .clear-search {
            position: absolute;
            right: 0.5rem;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            color: hsl(var(--muted-foreground));
            cursor: pointer;
            padding: 0.25rem;
            border-radius: 9999px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .clear-search:hover {
            color: hsl(var(--foreground));
        }

        /* Buttons */
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            height: 2.75rem;
            padding: 0 0.75rem;
            background: hsl(var(--card));
            border: 1px solid hsl(var(--border));
            border-radius: 9999px;
            color: hsl(var(--foreground));
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            white-space: nowrap;
        }

        .btn:hover {
            background: hsl(var(--muted));
        }

        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .btn.icon-only {
            width: 2.75rem;
            padding: 0;
        }

        /* Select Dropdown */
        .select {
            position: relative;
        }

        .select-trigger {
            height: 2.75rem;
            padding: 0 2.5rem 0 0.75rem;
            background: hsl(var(--card));
            border: 1px solid hsl(var(--border));
            border-radius: 9999px;
            color: hsl(var(--foreground));
            font-size: 0.875rem;
            cursor: pointer;
            white-space: nowrap;
        }

        .select-trigger:hover {
            background: hsl(var(--muted));
        }

        /* Pattern Grid */
        .patterns-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
            gap: 0.5rem;
            margin-bottom: 12rem;
        }

        @media (min-width: 640px) {
            .patterns-grid {
                gap: 1rem;
            }
        }

        .pattern-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.5rem;
            padding: 0.625rem;
            background: hsl(var(--card));
            border: 1px solid hsl(var(--border));
            border-radius: 0.75rem;
            cursor: pointer;
            transition: all 0.2s;
        }

        .pattern-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .pattern-card:active {
            transform: scale(0.95);
        }

        .pattern-preview-wrapper {
            position: relative;
            width: 100%;
            aspect-ratio: 1;
        }

        .pattern-preview {
            width: 100%;
            height: 100%;
            border-radius: 50%;
            overflow: hidden;
            border: 1px solid hsl(var(--border));
            background: hsl(var(--muted));
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .pattern-preview img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            /* Invert pattern previews for dark mode (same as Browse page) */
            filter: invert(1);
        }

        .panel-preview img {
            filter: invert(1);
        }

        .duration-badge {
            position: absolute;
            top: -0.25rem;
            left: -0.25rem;
            background: hsl(var(--primary) / 0.9);
            color: hsl(var(--primary-foreground));
            font-size: 0.625rem;
            font-weight: 500;
            padding: 0.125rem 0.375rem;
            border-radius: 9999px;
            border: 1px solid hsl(var(--primary));
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        }

        .pattern-info {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.25rem;
            padding: 0 0.125rem;
        }

        .pattern-name {
            flex: 1;
            min-width: 0;
            font-size: 0.75rem;
            font-weight: 700;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* Controls Bar */
        .controls-bar {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: hsl(var(--card));
            border-top: 1px solid hsl(var(--border));
            padding: 1rem;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 1rem;
            z-index: 50;
        }

        .control-btn {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.75rem 1.5rem;
            border-radius: 0.5rem;
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            border: none;
        }

        .control-btn.primary {
            background: hsl(var(--primary));
            color: hsl(var(--primary-foreground));
        }

        .control-btn.primary:hover {
            background: hsl(210 100% 45%);
        }

        .control-btn.secondary {
            background: hsl(var(--muted));
            color: hsl(var(--foreground));
            border: 1px solid hsl(var(--border));
        }

        .control-btn.secondary:hover {
            background: hsl(240 3.7% 20%);
        }

        .control-btn.destructive {
            background: hsl(0 62.8% 30.6%);
            color: hsl(var(--foreground));
        }

        .control-btn.destructive:hover {
            background: hsl(0 62.8% 35%);
        }

        .control-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* Loading State */
        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
        }

        .spinner {
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        /* Empty State */
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1rem;
            min-height: 40vh;
            text-align: center;
        }

        .empty-state-icon {
            padding: 1rem;
            background: hsl(var(--muted));
            border-radius: 9999px;
        }

        /* Toast Notification */
        .toast {
            position: fixed;
            top: 1rem;
            right: 1rem;
            background: hsl(var(--card));
            border: 1px solid hsl(var(--border));
            border-radius: 0.5rem;
            padding: 1rem 1.5rem;
            display: flex;
            align-items: center;
            gap: 0.75rem;
            z-index: 100;
            animation: slideIn 0.3s ease;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .toast.success {
            border-color: hsl(142 76% 36%);
        }

        .toast.error {
            border-color: hsl(0 62.8% 30.6%);
        }

        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        /* Side Panel */
        .panel-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 60;
            opacity: 0;
            transition: opacity 0.3s;
            pointer-events: none;
        }

        .panel-overlay.open {
            opacity: 1;
            pointer-events: auto;
        }

        .side-panel {
            position: fixed;
            top: 0;
            right: 0;
            bottom: 0;
            width: 90%;
            max-width: 400px;
            background: hsl(var(--card));
            border-left: 1px solid hsl(var(--border));
            z-index: 70;
            transform: translateX(100%);
            transition: transform 0.3s;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .side-panel.open {
            transform: translateX(0);
        }

        .panel-header {
            padding: 1.5rem;
            border-bottom: 1px solid hsl(var(--border));
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .panel-title {
            font-size: 1.125rem;
            font-weight: 600;
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            padding-right: 2rem;
        }

        .panel-close {
            position: absolute;
            right: 1rem;
            top: 1rem;
            background: none;
            border: none;
            color: hsl(var(--muted-foreground));
            cursor: pointer;
            padding: 0.5rem;
            border-radius: 9999px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }

        .panel-close:hover {
            background: hsl(var(--muted));
            color: hsl(var(--foreground));
        }

        .panel-content {
            padding: 1.5rem;
            overflow-y: auto;
            flex: 1;
        }

        .panel-preview {
            width: 100%;
            max-width: 280px;
            aspect-ratio: 1;
            margin: 0 auto 1.5rem;
            border-radius: 50%;
            overflow: hidden;
            border: 1px solid hsl(var(--border));
            background: hsl(var(--muted));
        }

        .panel-preview img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .panel-section {
            margin-bottom: 1.5rem;
        }

        .panel-label {
            font-size: 0.875rem;
            font-weight: 600;
            margin-bottom: 0.75rem;
            display: block;
        }

        .pre-execution-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 0.5rem;
        }

        .pre-execution-option {
            padding: 0.625rem;
            border: 1px solid hsl(var(--border));
            border-radius: 0.5rem;
            text-align: center;
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            background: hsl(var(--card));
            color: hsl(var(--muted-foreground));
        }

        .pre-execution-option:hover {
            color: hsl(var(--foreground));
            border-color: hsl(var(--primary));
        }

        .pre-execution-option.selected {
            background: hsl(var(--primary));
            color: hsl(var(--primary-foreground));
            border-color: hsl(var(--primary));
            ring: 2px;
            ring-color: hsl(var(--ring));
        }

        .panel-actions {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }

        .panel-btn {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            padding: 0.75rem 1.5rem;
            border-radius: 0.5rem;
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            border: none;
        }

        .panel-btn.primary {
            background: hsl(var(--primary));
            color: hsl(var(--primary-foreground));
            height: 2.75rem;
        }

        .panel-btn.primary:hover {
            background: hsl(210 100% 45%);
        }

        .panel-btn.secondary {
            background: transparent;
            color: hsl(var(--foreground));
            border: 1px solid hsl(var(--border));
        }

        .panel-btn.secondary:hover {
            background: hsl(var(--muted));
        }

        .panel-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* Animated Preview Modal */
        .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.8);
            z-index: 80;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 1rem;
        }

        .modal-overlay.open {
            display: flex;
        }

        .modal-content {
            background: hsl(var(--card));
            border-radius: 0.75rem;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
            max-width: 56rem;
            width: 100%;
            max-height: 95vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .modal-header {
            padding: 1.5rem;
            border-bottom: 1px solid hsl(var(--border));
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .modal-title {
            font-size: 1.25rem;
            font-weight: 600;
        }

        .modal-body {
            padding: 1.5rem;
            overflow-y: auto;
            flex: 1;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .canvas-wrapper {
            position: relative;
            width: 100%;
            max-width: 400px;
            aspect-ratio: 1;
        }

        .canvas-wrapper canvas {
            width: 100%;
            height: 100%;
            border-radius: 50%;
        }

        .play-overlay {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            border-radius: 50%;
            opacity: 0;
            transition: opacity 0.2s;
            background: rgba(0, 0, 0, 0.1);
        }

        .play-overlay:hover {
            opacity: 1;
        }

        .play-overlay-btn {
            background: hsl(var(--background) / 0.9);
            border-radius: 50%;
            width: 4rem;
            height: 4rem;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .modal-controls {
            padding: 1.5rem;
            border-top: 1px solid hsl(var(--border));
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        .slider-group {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }

        .slider-label {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.875rem;
            font-weight: 500;
        }

        .slider-value {
            color: hsl(var(--muted-foreground));
        }

        .slider {
            width: 100%;
            height: 0.5rem;
            background: hsl(var(--muted));
            border-radius: 9999px;
            outline: none;
            cursor: pointer;
            -webkit-appearance: none;
        }

        .slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 1.25rem;
            height: 1.25rem;
            background: hsl(var(--primary));
            border-radius: 50%;
            cursor: pointer;
        }

        .slider::-moz-range-thumb {
            width: 1.25rem;
            height: 1.25rem;
            background: hsl(var(--primary));
            border-radius: 50%;
            cursor: pointer;
            border: none;
        }

        .control-buttons {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 1rem;
        }

        /* Now Playing Bar - Collapsed Mini Bar */
        .now-playing-bar {
            position: fixed;
            bottom: 4.5rem;
            left: 0;
            right: 0;
            background: hsl(var(--background));
            border-top: 1px solid hsl(var(--border));
            padding: 1rem 1.5rem;
            display: none;
            align-items: center;
            gap: 1.5rem;
            z-index: 45;
            transition: all 0.3s;
            box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3);
            cursor: pointer;
        }

        .now-playing-bar:hover {
            background: hsl(var(--muted) / 0.5);
        }

        .now-playing-bar.visible {
            display: flex;
        }

        .now-playing-bar .now-playing-preview {
            width: 3.5rem;
            height: 3.5rem;
            border-radius: 50%;
            overflow: hidden;
            border: 2px solid hsl(var(--border));
            flex-shrink: 0;
            background: hsl(var(--muted));
            cursor: pointer;
            transition: border-color 0.2s;
        }

        .now-playing-bar .now-playing-preview:hover {
            border-color: hsl(var(--primary));
        }

        .now-playing-bar .now-playing-preview img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            filter: invert(1);
        }

        .now-playing-bar .now-playing-content {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }

        .now-playing-bar .now-playing-name {
            font-size: 0.875rem;
            font-weight: 600;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .now-playing-bar .now-playing-status {
            font-size: 0.75rem;
            color: hsl(var(--muted-foreground));
        }

        .now-playing-bar .now-playing-icon {
            color: hsl(var(--muted-foreground));
            font-size: 1.5rem;
        }

        .loading-canvas {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            max-width: 400px;
            aspect-ratio: 1;
            background: hsl(var(--muted));
            border-radius: 50%;
        }

        /* Queue Item Styles */
        .queue-item {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem;
            border-radius: 0.5rem;
            background: hsl(var(--card));
            border: 1px solid hsl(var(--border));
            margin-bottom: 0.25rem;
            cursor: grab;
            transition: all 0.2s;
        }

        .queue-item:hover {
            background: hsl(var(--muted) / 0.5);
        }

        .queue-item.dragging {
            opacity: 0.5;
            cursor: grabbing;
        }

        .queue-item.drag-over {
            border-color: hsl(var(--primary));
            background: hsl(var(--primary) / 0.1);
        }

        .queue-item-drag-handle {
            width: 1.5rem;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            cursor: grab;
            color: hsl(var(--muted-foreground));
        }

        .queue-item-preview {
            width: 4rem;
            height: 4rem;
            border-radius: 50%;
            overflow: hidden;
            background: hsl(var(--muted));
            border: 1px solid hsl(var(--border));
            flex-shrink: 0;
        }

        .queue-item-preview img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            filter: invert(1);
        }

        .queue-item-info {
            flex: 1;
            min-width: 0;
        }

        .queue-item-name {
            font-size: 0.875rem;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .queue-item-index {
            font-size: 0.75rem;
            color: hsl(var(--muted-foreground));
        }

        .queue-item-actions {
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
            flex-shrink: 0;
        }

        .queue-item-action-btn {
            padding: 0.25rem;
            border-radius: 0.25rem;
            background: none;
            border: none;
            cursor: pointer;
            color: hsl(var(--muted-foreground));
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .queue-item-action-btn:hover:not(:disabled) {
            background: hsl(var(--muted));
            color: hsl(var(--foreground));
        }

        .queue-item-action-btn:disabled {
            opacity: 0.3;
            cursor: not-allowed;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="header-content">
                <h1>Sand Table Control</h1>
                <p id="patternCount">Loading patterns...</p>
            </div>
        </div>

        <!-- Filter Bar -->
        <div class="filter-bar">
            <div class="filter-controls">
                <!-- Search -->
                <div class="search-wrapper">
                    <span class="material-icons-outlined search-icon">search</span>
                    <input
                        type="text"
                        class="search-input"
                        id="searchInput"
                        placeholder="Search patterns..."
                    >
                    <button class="clear-search" id="clearSearch" style="display: none;">
                        <span class="material-icons">close</span>
                    </button>
                </div>

                <!-- Sort -->
                <select class="select-trigger" id="sortBy">
                    <option value="name">Name</option>
                    <option value="date">Modified</option>
                </select>

                <!-- Sort Direction -->
                <button class="btn icon-only" id="sortDirection" title="Ascending">
                    <span class="material-icons-outlined">arrow_upward</span>
                </button>
            </div>
        </div>

        <!-- Patterns Grid -->
        <div id="patternsContainer" class="loading">
            <span class="material-icons-outlined spinner" style="font-size: 3rem; color: hsl(var(--muted-foreground));">
                sync
            </span>
        </div>
    </div>

    <!-- Controls Bar -->
    <div class="controls-bar">
        <button class="control-btn secondary" id="pauseBtn" disabled>
            <span class="material-icons">pause</span>
            Pause
        </button>
        <button class="control-btn destructive" id="stopBtn" disabled>
            <span class="material-icons">stop</span>
            Stop
        </button>
        <button class="control-btn secondary" id="clearBtn">
            <span class="material-icons">cleaning_services</span>
            Clear
        </button>
    </div>

    <!-- Side Panel Overlay -->
    <div class="panel-overlay" id="panelOverlay" onclick="closePanel()"></div>

    <!-- Side Panel -->
    <div class="side-panel" id="sidePanel">
        <div class="panel-header">
            <h2 class="panel-title" id="panelTitle">Pattern Details</h2>
            <button class="panel-close" onclick="closePanel()">
                <span class="material-icons">close</span>
            </button>
        </div>
        <div class="panel-content">
            <!-- Preview Image (clickable) -->
            <div class="panel-preview" style="cursor: pointer;" onclick="openAnimatedPreview()">
                <img id="panelPreview" alt="Pattern preview">
            </div>
            <p style="text-align: center; font-size: 0.75rem; color: hsl(var(--muted-foreground)); margin-top: -1rem; margin-bottom: 1.5rem;">
                Tap to preview animation
            </p>

            <!-- Pre-Execution Options -->
            <div class="panel-section">
                <label class="panel-label">Pre-Execution Action</label>
                <div class="pre-execution-grid">
                    <div class="pre-execution-option selected" data-value="adaptive">Adaptive</div>
                    <div class="pre-execution-option" data-value="clear_from_in">Clear From Center</div>
                    <div class="pre-execution-option" data-value="clear_from_out">Clear From Perimeter</div>
                    <div class="pre-execution-option" data-value="clear_sideway">Clear Sideways</div>
                    <div class="pre-execution-option" data-value="none">None</div>
                </div>
            </div>

            <!-- Action Buttons -->
            <div class="panel-actions">
                <button class="panel-btn primary" id="panelPlayBtn">
                    <span class="material-icons">play_arrow</span>
                    Play
                </button>

                <!-- Queue buttons -->
                <div style="display: flex; gap: 0.5rem;">
                    <button class="panel-btn secondary" id="panelPlayNextBtn" style="flex: 1;">
                        <span class="material-icons-outlined" style="font-size: 1.125rem;">playlist_play</span>
                        Play Next
                    </button>
                    <button class="panel-btn secondary" id="panelAddToQueueBtn" style="flex: 1;">
                        <span class="material-icons-outlined" style="font-size: 1.125rem;">playlist_add</span>
                        Add to Queue
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Animated Preview Modal (Playback Simulation) -->
    <div class="modal-overlay" id="animatedPreviewModal" onclick="if(event.target === this) closeAnimatedPreview()">
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title" id="previewModalTitle">Animated Preview</h3>
                <button class="panel-close" onclick="closeAnimatedPreview(); event.stopPropagation();">
                    <span class="material-icons">close</span>
                </button>
            </div>
            <div class="modal-body">
                <div id="canvasContainer"></div>
            </div>
            <div class="modal-controls">
                <!-- Speed Slider -->
                <div class="slider-group">
                    <div class="slider-label">
                        <span>Speed</span>
                        <span class="slider-value" id="speedValue">1x</span>
                    </div>
                    <input type="range" class="slider" id="speedSlider" min="0.1" max="5" step="0.1" value="1">
                </div>

                <!-- Progress Slider -->
                <div class="slider-group">
                    <div class="slider-label">
                        <span>Progress</span>
                        <span class="slider-value" id="progressValue">0%</span>
                    </div>
                    <input type="range" class="slider" id="progressSlider" min="0" max="100" step="0.1" value="0">
                </div>

                <!-- Control Buttons -->
                <div class="control-buttons">
                    <button class="control-btn primary" id="playPauseBtn" onclick="togglePlayPause()">
                        <span class="material-icons">play_arrow</span>
                        <span>Play</span>
                    </button>
                    <button class="control-btn secondary" id="resetBtn" onclick="resetPreview()">
                        <span class="material-icons">replay</span>
                        <span>Reset</span>
                    </button>
                    <button class="control-btn secondary" onclick="closeAnimatedPreview()">
                        <span class="material-icons">close</span>
                        <span>Close</span>
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Real-Time Now Playing Modal -->
    <div class="modal-overlay" id="nowPlayingModal" onclick="if(event.target === this) closeNowPlayingModal()">
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title" id="nowPlayingModalTitle">Now Playing</h3>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <button class="btn icon-only" onclick="openQueueModal(); event.stopPropagation();" title="View queue" style="height: 2.5rem; width: 2.5rem;">
                        <span class="material-icons-outlined">queue_music</span>
                    </button>
                    <button class="panel-close" onclick="closeNowPlayingModal(); event.stopPropagation();">
                        <span class="material-icons">close</span>
                    </button>
                </div>
            </div>
            <div class="modal-body">
                <div id="liveCanvasContainer"></div>
            </div>
            <div class="modal-controls">
                <!-- Progress -->
                <div class="slider-group">
                    <div class="slider-label">
                        <span>Progress</span>
                        <span class="slider-value" id="liveProgressValue">0%</span>
                    </div>
                    <input type="range" class="slider" id="liveProgressSlider" min="0" max="100" step="0.1" value="0" disabled>
                </div>

                <!-- Time Display -->
                <div class="slider-label">
                    <span id="liveElapsedTime">0:00</span>
                    <span id="liveRemainingTime">-0:00</span>
                </div>

                <!-- Control Buttons -->
                <div class="control-buttons">
                    <button class="control-btn destructive" id="liveStopBtn" onclick="handleLiveStop()">
                        <span class="material-icons">stop</span>
                        <span>Stop</span>
                    </button>
                    <button class="control-btn primary" id="livePauseBtn" onclick="handleLivePause()">
                        <span class="material-icons">pause</span>
                        <span>Pause</span>
                    </button>
                    <button class="control-btn secondary" onclick="closeNowPlayingModal()">
                        <span class="material-icons">close</span>
                        <span>Close</span>
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Queue Modal -->
    <div class="modal-overlay" id="queueModal" onclick="if(event.target === this) closeQueueModal()">
        <div class="modal-content" style="max-width: 32rem;">
            <div class="modal-header">
                <h3 class="modal-title">
                    <span class="material-icons-outlined" style="vertical-align: middle; margin-right: 0.5rem;">queue_music</span>
                    Queue
                    <span id="queuePlaylistName" style="font-size: 0.875rem; font-weight: 400; color: hsl(var(--muted-foreground)); margin-left: 0.5rem;"></span>
                </h3>
                <button class="panel-close" onclick="closeQueueModal(); event.stopPropagation();">
                    <span class="material-icons">close</span>
                </button>
            </div>
            <div class="modal-body" style="max-height: 60vh; overflow-y: auto; padding: 1rem;">
                <div id="queueContainer"></div>
            </div>
        </div>
    </div>

    <!-- Now Playing Bar -->
    <div class="now-playing-bar" id="nowPlayingBar" onclick="openNowPlayingModal()">
        <div class="now-playing-preview">
            <img id="nowPlayingPreview" alt="Now playing">
        </div>
        <div class="now-playing-content">
            <div class="now-playing-name" id="nowPlayingName">Pattern Name</div>
            <div class="now-playing-status" id="nowPlayingStatus">Playing</div>
        </div>
        <span class="material-icons-outlined now-playing-icon">play_circle</span>
    </div>

    <script>
        const API_BASE = '__API_BASE_URL__';
        let patterns = [];
        let currentState = null;
        let ws = null;
        let searchQuery = '';
        let sortBy = 'name';
        let sortAsc = true;
        let selectedPattern = null;
        let preExecution = 'adaptive';

        // Animation state (for playback simulation)
        let coordinates = [];
        let isPlaying = false;
        let speed = 1;
        let progress = 0;
        let currentIndex = 0;
        let animationId = null;
        let canvas = null;
        let ctx = null;
        let offscreenCanvas = null;
        let lastDrawnIndex = -1;

        // Real-time live preview state
        let liveCanvas = null;
        let liveCtx = null;
        let liveOffscreenCanvas = null;
        let liveCoordinates = [];
        let liveLastDrawnIndex = -1;
        let liveAnimationId = null;

        // Queue state
        let queuePreviews = {};
        let draggedElement = null;
        let draggedIndex = null;

        // Show toast notification
        function showToast(message, type = 'success') {
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.innerHTML = `
                <span class="material-icons-outlined">
                    ${type === 'success' ? 'check_circle' : 'error'}
                </span>
                <span>${message}</span>
            `;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }

        // Fetch patterns from API
        async function fetchPatterns() {
            try {
                const response = await fetch(`${API_BASE}/list_theta_rho_files_with_metadata`);
                if (!response.ok) throw new Error('Failed to fetch patterns');

                const data = await response.json();
                patterns = data.map(p => ({
                    path: p.path,
                    name: p.name,
                    category: p.category,
                    estimated_duration: p.estimated_duration,
                    date_modified: p.date_modified
                }));

                renderPatterns();
            } catch (error) {
                console.error('Error fetching patterns:', error);
                document.getElementById('patternsContainer').innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">
                            <span class="material-icons-outlined" style="font-size: 3rem; color: hsl(var(--muted-foreground));">
                                error_outline
                            </span>
                        </div>
                        <div>
                            <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.25rem;">Failed to load patterns</h2>
                            <p style="color: hsl(var(--muted-foreground)); font-size: 0.875rem;">Is the backend running?</p>
                        </div>
                    </div>
                `;
            }
        }

        // Connect to WebSocket for real-time status updates
        function connectWebSocket() {
            const wsUrl = API_BASE.replace('http://', 'ws://').replace('https://', 'wss://');
            ws = new WebSocket(`${wsUrl}/ws/status`);

            ws.onopen = () => {
                console.log('WebSocket connected');
            };

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    if (message.type === 'status_update' && message.data) {
                        currentState = {
                            current_pattern: message.data.current_file,
                            is_paused: message.data.is_paused,
                            is_running: message.data.is_running,
                            progress: message.data.progress || null,
                            playlist: message.data.playlist || null
                        };
                        updateControls();
                        updateLivePreview();
                    }
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };

            ws.onclose = () => {
                console.log('WebSocket disconnected, reconnecting in 3s...');
                setTimeout(connectWebSocket, 3000);
            };
        }

        // Update control buttons
        function updateControls() {
            const pauseBtn = document.getElementById('pauseBtn');
            const stopBtn = document.getElementById('stopBtn');

            const isPlaying = currentState?.current_pattern && !currentState?.is_paused;
            const isPaused = currentState?.is_paused;

            pauseBtn.disabled = !currentState?.current_pattern;
            stopBtn.disabled = !currentState?.current_pattern;

            if (isPaused) {
                pauseBtn.innerHTML = '<span class="material-icons">play_arrow</span> Resume';
            } else {
                pauseBtn.innerHTML = '<span class="material-icons">pause</span> Pause';
            }

            // Update Now Playing bar
            updateNowPlayingBar();
        }

        // Update Now Playing bar
        function updateNowPlayingBar() {
            const bar = document.getElementById('nowPlayingBar');
            const preview = document.getElementById('nowPlayingPreview');
            const name = document.getElementById('nowPlayingName');
            const status = document.getElementById('nowPlayingStatus');

            if (currentState?.current_pattern && currentState?.is_running) {
                // Find pattern info
                const patternPath = currentState.current_pattern;
                const patternName = patternPath.split('/').pop().replace('.thr', '');

                // Update preview image
                const encodedPath = patternPath.replace(/\//g, '--');
                preview.src = `${API_BASE}/preview/${encodedPath}`;

                // Update text
                name.textContent = patternName;
                status.textContent = currentState.is_paused ? 'Paused' : 'Playing';

                // Show bar
                bar.classList.add('visible');
                console.log('Now Playing bar shown for:', patternName);
            } else {
                // Hide bar
                bar.classList.remove('visible');
                console.log('Now Playing bar hidden');
            }
        }

        // Polar to Cartesian conversion
        function polarToCartesian(theta, rho, size) {
            const centerX = size / 2;
            const centerY = size / 2;
            const radius = (size / 2) * 0.9 * rho;
            const x = centerX + radius * Math.cos(theta);
            const y = centerY + radius * Math.sin(theta);
            return { x, y };
        }

        // Initialize canvas with better contrast
        function initCanvas(size) {
            if (!offscreenCanvas) {
                offscreenCanvas = document.createElement('canvas');
            }

            offscreenCanvas.width = size;
            offscreenCanvas.height = size;
            const offCtx = offscreenCanvas.getContext('2d');

            // Darker outer background for better contrast
            offCtx.fillStyle = '#0a0a0a';
            offCtx.fillRect(0, 0, size, size);

            // Lighter inner circle
            offCtx.beginPath();
            offCtx.arc(size / 2, size / 2, (size / 2) * 0.95, 0, Math.PI * 2);
            offCtx.fillStyle = '#1a1a1a';
            offCtx.fill();
            offCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            offCtx.lineWidth = 1;
            offCtx.stroke();

            lastDrawnIndex = 0;
        }

        // Draw pattern with better line contrast
        function drawPattern(coords, upToIndex) {
            if (!canvas || !coords || coords.length === 0) return;

            const size = canvas.width;

            // Reinitialize if needed
            if (upToIndex < lastDrawnIndex || !offscreenCanvas) {
                initCanvas(size);
            }

            const offCtx = offscreenCanvas.getContext('2d');

            // Draw new segments
            if (upToIndex > lastDrawnIndex) {
                // Bright white lines for maximum contrast
                offCtx.strokeStyle = '#ffffff';
                offCtx.lineWidth = 1.5;
                offCtx.lineCap = 'round';
                offCtx.lineJoin = 'round';

                offCtx.beginPath();
                const startPoint = polarToCartesian(coords[lastDrawnIndex][0], coords[lastDrawnIndex][1], size);
                offCtx.moveTo(startPoint.x, startPoint.y);

                for (let i = lastDrawnIndex + 1; i <= upToIndex && i < coords.length; i++) {
                    const point = polarToCartesian(coords[i][0], coords[i][1], size);
                    offCtx.lineTo(point.x, point.y);
                }
                offCtx.stroke();

                lastDrawnIndex = upToIndex;
            }

            // Copy to main canvas
            ctx.drawImage(offscreenCanvas, 0, 0);

            // Draw current position marker
            if (upToIndex < coords.length) {
                const currentPoint = polarToCartesian(coords[upToIndex][0], coords[upToIndex][1], size);
                ctx.beginPath();
                ctx.arc(currentPoint.x, currentPoint.y, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#0b80ee';
                ctx.fill();
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }

        // Animation loop
        function animate() {
            if (!isPlaying || coordinates.length === 0) return;

            const coordsPerFrame = Math.max(1, Math.floor(speed * 2));
            currentIndex = Math.min(currentIndex + coordsPerFrame, coordinates.length - 1);

            drawPattern(coordinates, currentIndex);
            progress = (currentIndex / (coordinates.length - 1)) * 100;
            document.getElementById('progressValue').textContent = `${Math.round(progress)}%`;
            document.getElementById('progressSlider').value = progress;

            if (currentIndex < coordinates.length - 1) {
                animationId = requestAnimationFrame(animate);
            } else {
                isPlaying = false;
                updatePlayPauseButton();
            }
        }

        // Fetch coordinates
        async function fetchCoordinates(patternPath) {
            try {
                const response = await fetch(`${API_BASE}/get_theta_rho_coordinates`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file_name: patternPath })
                });

                if (!response.ok) throw new Error('Failed to fetch coordinates');

                const data = await response.json();
                return data.coordinates || [];
            } catch (error) {
                console.error('Error fetching coordinates:', error);
                showToast('Failed to load pattern coordinates', 'error');
                return [];
            }
        }

        // Open animated preview
        async function openAnimatedPreview(liveMode = false) {
            if (!selectedPattern) return;

            // Show modal
            const modal = document.getElementById('animatedPreviewModal');
            const container = document.getElementById('canvasContainer');
            const title = document.getElementById('previewModalTitle');

            title.textContent = selectedPattern.name;
            modal.classList.add('open');

            // Show loading state
            container.innerHTML = '<div class="loading-canvas"><span class="material-icons-outlined spinner" style="font-size: 3rem;">sync</span></div>';

            // Fetch coordinates
            coordinates = await fetchCoordinates(selectedPattern.path);

            if (coordinates.length === 0) {
                container.innerHTML = '<div class="loading-canvas"><span style="color: hsl(var(--muted-foreground));">No coordinates found</span></div>';
                return;
            }

            // Create canvas
            canvas = document.createElement('canvas');
            canvas.width = 400;
            canvas.height = 400;
            ctx = canvas.getContext('2d');

            // Add play overlay
            const wrapper = document.createElement('div');
            wrapper.className = 'canvas-wrapper';
            wrapper.innerHTML = `
                <div class="play-overlay" onclick="togglePlayPause()">
                    <div class="play-overlay-btn">
                        <span class="material-icons" style="font-size: 2rem;">play_arrow</span>
                    </div>
                </div>
            `;
            wrapper.insertBefore(canvas, wrapper.firstChild);

            container.innerHTML = '';
            container.appendChild(wrapper);

            // Initialize and draw
            initCanvas(400);
            currentIndex = 0;
            progress = 0;
            isPlaying = false;
            drawPattern(coordinates, 0);

            // Auto-play
            if (liveMode) {
                // In live mode, sync with actual progress if possible
                setTimeout(() => togglePlayPause(), 100);
            } else {
                setTimeout(() => togglePlayPause(), 100);
            }
        }

        // Close animated preview
        function closeAnimatedPreview() {
            const modal = document.getElementById('animatedPreviewModal');
            modal.classList.remove('open');

            // Stop animation
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
            isPlaying = false;
            coordinates = [];
            canvas = null;
            ctx = null;
        }

        // Toggle play/pause
        function togglePlayPause() {
            isPlaying = !isPlaying;
            updatePlayPauseButton();

            if (isPlaying) {
                if (currentIndex >= coordinates.length - 1) {
                    currentIndex = 0;
                    progress = 0;
                }
                animate();
            } else if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
        }

        // Update play/pause button
        function updatePlayPauseButton() {
            const btn = document.getElementById('playPauseBtn');
            if (isPlaying) {
                btn.innerHTML = '<span class="material-icons">pause</span><span>Pause</span>';
            } else {
                btn.innerHTML = '<span class="material-icons">play_arrow</span><span>Play</span>';
            }
        }

        // Reset preview
        function resetPreview() {
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
            isPlaying = false;
            currentIndex = 0;
            progress = 0;
            document.getElementById('progressValue').textContent = '0%';
            document.getElementById('progressSlider').value = 0;
            updatePlayPauseButton();

            if (canvas && coordinates.length > 0) {
                initCanvas(400);
                drawPattern(coordinates, 0);
            }
        }

        // Format duration
        function formatDuration(seconds) {
            if (!seconds) return null;
            if (seconds < 60) return `${Math.round(seconds)}s`;
            const minutes = Math.floor(seconds / 60);
            return `${minutes}m`;
        }

        // Format time in MM:SS format
        function formatTime(seconds) {
            if (!seconds || seconds < 0) return '0:00';
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }

        // Initialize live canvas
        function initLiveCanvas(size) {
            if (!liveOffscreenCanvas) {
                liveOffscreenCanvas = document.createElement('canvas');
            }

            liveOffscreenCanvas.width = size;
            liveOffscreenCanvas.height = size;
            const offCtx = liveOffscreenCanvas.getContext('2d');

            // Darker outer background for better contrast
            offCtx.fillStyle = '#0a0a0a';
            offCtx.fillRect(0, 0, size, size);

            // Lighter inner circle
            offCtx.beginPath();
            offCtx.arc(size / 2, size / 2, (size / 2) * 0.95, 0, Math.PI * 2);
            offCtx.fillStyle = '#1a1a1a';
            offCtx.fill();
            offCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            offCtx.lineWidth = 1;
            offCtx.stroke();

            liveLastDrawnIndex = 0;
        }

        // Draw live pattern
        function drawLivePattern(coords, upToIndex) {
            if (!liveCanvas || !coords || coords.length === 0) return;

            const size = liveCanvas.width;

            // Reinitialize if needed
            if (upToIndex < liveLastDrawnIndex || !liveOffscreenCanvas) {
                initLiveCanvas(size);
            }

            const offCtx = liveOffscreenCanvas.getContext('2d');

            // Draw new segments
            if (upToIndex > liveLastDrawnIndex) {
                // Bright white lines for maximum contrast
                offCtx.strokeStyle = '#ffffff';
                offCtx.lineWidth = 1.5;
                offCtx.lineCap = 'round';
                offCtx.lineJoin = 'round';

                offCtx.beginPath();
                const startPoint = polarToCartesian(coords[liveLastDrawnIndex][0], coords[liveLastDrawnIndex][1], size);
                offCtx.moveTo(startPoint.x, startPoint.y);

                for (let i = liveLastDrawnIndex + 1; i <= upToIndex && i < coords.length; i++) {
                    const point = polarToCartesian(coords[i][0], coords[i][1], size);
                    offCtx.lineTo(point.x, point.y);
                }
                offCtx.stroke();

                liveLastDrawnIndex = upToIndex;
            }

            // Copy to main canvas
            liveCtx.drawImage(liveOffscreenCanvas, 0, 0);

            // Draw current position marker
            if (upToIndex < coords.length) {
                const currentPoint = polarToCartesian(coords[upToIndex][0], coords[upToIndex][1], size);
                liveCtx.beginPath();
                liveCtx.arc(currentPoint.x, currentPoint.y, 5, 0, Math.PI * 2);
                liveCtx.fillStyle = '#0b80ee';
                liveCtx.fill();
                liveCtx.strokeStyle = '#000000';
                liveCtx.lineWidth = 1;
                liveCtx.stroke();
            }
        }

        // Update live preview based on current state
        function updateLivePreview() {
            // Only update if the live modal is open
            const modal = document.getElementById('nowPlayingModal');
            if (!modal.classList.contains('open') || !liveCanvas || !liveCoordinates.length) {
                return;
            }

            // Update progress from WebSocket state
            if (currentState?.progress) {
                const percentage = currentState.progress.percentage || 0;
                const elapsed = currentState.progress.elapsed_time || 0;
                const remaining = currentState.progress.remaining_time || 0;

                // Update UI elements
                document.getElementById('liveProgressValue').textContent = `${Math.round(percentage)}%`;
                document.getElementById('liveProgressSlider').value = percentage;
                document.getElementById('liveElapsedTime').textContent = formatTime(elapsed);
                document.getElementById('liveRemainingTime').textContent = `-${formatTime(remaining)}`;

                // Draw pattern up to current progress
                const targetIndex = Math.floor((percentage / 100) * (liveCoordinates.length - 1));
                drawLivePattern(liveCoordinates, targetIndex);
            }

            // Update pause button state
            const pauseBtn = document.getElementById('livePauseBtn');
            if (currentState?.is_paused) {
                pauseBtn.innerHTML = '<span class="material-icons">play_arrow</span><span>Resume</span>';
            } else {
                pauseBtn.innerHTML = '<span class="material-icons">pause</span><span>Pause</span>';
            }
        }

        // Open real-time Now Playing modal
        async function openNowPlayingModal() {
            if (!currentState?.current_pattern) return;

            const modal = document.getElementById('nowPlayingModal');
            const container = document.getElementById('liveCanvasContainer');
            const title = document.getElementById('nowPlayingModalTitle');

            // Set title
            const patternName = currentState.current_pattern.split('/').pop().replace('.thr', '');
            title.textContent = patternName;

            // Show modal
            modal.classList.add('open');

            // Show loading state
            container.innerHTML = '<div class="loading-canvas"><span class="material-icons-outlined spinner" style="font-size: 3rem;">sync</span></div>';

            // Fetch coordinates
            liveCoordinates = await fetchCoordinates(currentState.current_pattern);

            if (liveCoordinates.length === 0) {
                container.innerHTML = '<div class="loading-canvas"><span style="color: hsl(var(--muted-foreground));">No coordinates found</span></div>';
                return;
            }

            // Create canvas
            liveCanvas = document.createElement('canvas');
            liveCanvas.width = 400;
            liveCanvas.height = 400;
            liveCtx = liveCanvas.getContext('2d');

            const wrapper = document.createElement('div');
            wrapper.className = 'canvas-wrapper';
            wrapper.appendChild(liveCanvas);

            container.innerHTML = '';
            container.appendChild(wrapper);

            // Initialize canvas
            initLiveCanvas(400);

            // Draw initial state based on current progress
            if (currentState?.progress) {
                const percentage = currentState.progress.percentage || 0;
                const targetIndex = Math.floor((percentage / 100) * (liveCoordinates.length - 1));
                drawLivePattern(liveCoordinates, targetIndex);
            } else {
                drawLivePattern(liveCoordinates, 0);
            }
        }

        // Close real-time Now Playing modal
        function closeNowPlayingModal() {
            const modal = document.getElementById('nowPlayingModal');
            modal.classList.remove('open');

            // Clean up canvas state
            liveCanvas = null;
            liveCtx = null;
            liveCoordinates = [];
            liveLastDrawnIndex = -1;
        }

        // Handle live stop button
        async function handleLiveStop() {
            try {
                const response = await fetch(`${API_BASE}/api/stop`, { method: 'POST' });
                if (!response.ok) throw new Error('Failed to stop');
                showToast('Stopped');
                closeNowPlayingModal();
            } catch (error) {
                console.error('Error stopping:', error);
                showToast('Failed to stop', 'error');
            }
        }

        // Handle live pause/resume button
        async function handleLivePause() {
            try {
                const endpoint = currentState?.is_paused ? '/api/resume' : '/api/pause';
                const response = await fetch(`${API_BASE}${endpoint}`, { method: 'POST' });
                if (!response.ok) throw new Error('Failed to toggle pause');
                showToast(currentState?.is_paused ? 'Resumed' : 'Paused');
            } catch (error) {
                console.error('Error toggling pause:', error);
                showToast('Failed to toggle pause', 'error');
            }
        }

        // Filter and sort patterns
        function getFilteredPatterns() {
            let result = [...patterns];

            // Filter by search
            if (searchQuery) {
                result = result.filter(p =>
                    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    p.category.toLowerCase().includes(searchQuery.toLowerCase())
                );
            }

            // Sort
            result.sort((a, b) => {
                let comparison = 0;
                if (sortBy === 'name') {
                    comparison = a.name.localeCompare(b.name);
                } else if (sortBy === 'date') {
                    comparison = a.date_modified - b.date_modified;
                }
                return sortAsc ? comparison : -comparison;
            });

            return result;
        }

        // Render patterns grid
        function renderPatterns() {
            const container = document.getElementById('patternsContainer');
            const countEl = document.getElementById('patternCount');
            const filtered = getFilteredPatterns();

            countEl.textContent = `${patterns.length} patterns available`;

            if (filtered.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">
                            <span class="material-icons-outlined" style="font-size: 3rem; color: hsl(var(--muted-foreground));">
                                search_off
                            </span>
                        </div>
                        <div>
                            <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.25rem;">No patterns found</h2>
                            <p style="color: hsl(var(--muted-foreground)); font-size: 0.875rem;">Try adjusting your search</p>
                        </div>
                    </div>
                `;
                return;
            }

            container.className = 'patterns-grid';
            container.innerHTML = filtered.map(pattern => {
                const encodedPath = pattern.path.replace(/\//g, '--');

                return `
                    <div class="pattern-card" onclick="openPanel('${pattern.path}')">
                        <div class="pattern-preview-wrapper">
                            <div class="pattern-preview">
                                <img src="${API_BASE}/preview/${encodedPath}"
                                     alt="${pattern.name}"
                                     loading="lazy"
                                     onerror="this.style.display='none'">
                            </div>
                        </div>
                        <div class="pattern-info">
                            <span class="pattern-name" title="${pattern.name}">${pattern.name}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Open side panel for pattern
        function openPanel(path) {
            selectedPattern = patterns.find(p => p.path === path);
            if (!selectedPattern) return;

            // Update panel content
            document.getElementById('panelTitle').textContent = selectedPattern.name;
            const encodedPath = selectedPattern.path.replace(/\//g, '--');
            document.getElementById('panelPreview').src = `${API_BASE}/preview/${encodedPath}`;

            // Show panel
            document.getElementById('panelOverlay').classList.add('open');
            document.getElementById('sidePanel').classList.add('open');
        }

        // Close side panel
        function closePanel() {
            document.getElementById('panelOverlay').classList.remove('open');
            document.getElementById('sidePanel').classList.remove('open');
            selectedPattern = null;
        }

        // Play pattern from panel
        async function playPatternFromPanel() {
            if (!selectedPattern) return;

            try {
                const response = await fetch(`${API_BASE}/run_theta_rho`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        file_name: selectedPattern.path,
                        pre_execution: preExecution
                    })
                });

                if (!response.ok) throw new Error('Failed to play pattern');

                showToast(`Running ${selectedPattern.name}`);
                closePanel();
            } catch (error) {
                console.error('Error playing pattern:', error);
                const message = error.message;
                if (message.includes('409') || message.includes('already running')) {
                    showToast('Another pattern is already running', 'error');
                } else {
                    showToast('Failed to play pattern', 'error');
                }
            }
        }

        // Pause/Resume
        async function togglePause() {
            try {
                const endpoint = currentState?.is_paused ? '/api/resume' : '/api/pause';
                const response = await fetch(`${API_BASE}${endpoint}`, { method: 'POST' });

                if (!response.ok) throw new Error('Failed to toggle pause');

                showToast(currentState?.is_paused ? 'Resumed' : 'Paused');
            } catch (error) {
                console.error('Error toggling pause:', error);
                showToast('Failed to toggle pause', 'error');
            }
        }

        // Stop
        async function stop() {
            try {
                const response = await fetch(`${API_BASE}/api/stop`, { method: 'POST' });

                if (!response.ok) throw new Error('Failed to stop');

                showToast('Stopped');
            } catch (error) {
                console.error('Error stopping:', error);
                showToast('Failed to stop', 'error');
            }
        }

        // Clear - macro that stops current pattern then clears from perimeter
        async function clear() {
            try {
                // Step 1: Stop any running pattern
                if (currentState?.current_pattern) {
                    const stopResponse = await fetch(`${API_BASE}/api/stop`, { method: 'POST' });
                    if (!stopResponse.ok) {
                        console.warn('Failed to stop pattern, continuing with clear...');
                    }
                    // Wait a moment for stop to complete
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                // Step 2: Clear from perimeter (auto-selects right pattern for table type)
                const clearResponse = await fetch(`${API_BASE}/run_theta_rho`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        file_name: 'clear_from_out.thr',
                        pre_execution: 'none'
                    })
                });

                if (!clearResponse.ok) throw new Error('Failed to clear');

                showToast('Clearing table');
            } catch (error) {
                console.error('Error clearing:', error);
                const message = error.message;
                if (message.includes('409') || message.includes('already running')) {
                    showToast('Failed to clear - pattern still running', 'error');
                } else {
                    showToast('Failed to clear', 'error');
                }
            }
        }

        // Add to queue functions
        async function addToQueue(position) {
            if (!selectedPattern) return;

            try {
                const response = await fetch(`${API_BASE}/add_to_queue`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        pattern: selectedPattern.path,
                        position: position
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(errorText);
                }

                showToast(position === 'next' ? 'Playing next' : 'Added to queue');
            } catch (error) {
                console.error('Error adding to queue:', error);
                const message = error.message;
                if (message.includes('400') || message.includes('No playlist')) {
                    showToast('No playlist is currently running', 'error');
                } else {
                    showToast('Failed to add to queue', 'error');
                }
            }
        }

        // Open queue modal
        async function openQueueModal() {
            const modal = document.getElementById('queueModal');
            modal.classList.add('open');
            await renderQueue();
        }

        // Close queue modal
        function closeQueueModal() {
            const modal = document.getElementById('queueModal');
            modal.classList.remove('open');
        }

        // Render queue items
        async function renderQueue() {
            const container = document.getElementById('queueContainer');
            const playlistNameEl = document.getElementById('queuePlaylistName');

            if (!currentState?.playlist) {
                container.innerHTML = '<p style="text-align: center; color: hsl(var(--muted-foreground)); padding: 2rem;">No queue</p>';
                playlistNameEl.textContent = '';
                return;
            }

            const playlist = currentState.playlist;
            playlistNameEl.textContent = playlist.name ? `• ${playlist.name}` : '';

            const files = playlist.files || [];
            const currentIndex = playlist.current_index || 0;

            // Show only upcoming patterns
            const upcomingFiles = files
                .map((file, index) => ({ file, index }))
                .filter(({ index }) => index > currentIndex);

            if (upcomingFiles.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: hsl(var(--muted-foreground)); padding: 2rem;">No upcoming patterns</p>';
                return;
            }

            container.innerHTML = upcomingFiles.map(({ file, index }) => {
                const patternName = file.split('/').pop().replace('.thr', '');
                const encodedPath = file.replace(/\//g, '--');
                const previewUrl = queuePreviews[file] || null;
                const isFirst = index === upcomingFiles[0].index;
                const isLast = index === upcomingFiles[upcomingFiles.length - 1].index;

                // Lazy load preview
                if (!previewUrl && !queuePreviews[file]) {
                    fetchQueuePreview(file);
                }

                return `
                    <div class="queue-item" draggable="true" data-index="${index}" data-file="${file}">
                        <div class="queue-item-drag-handle">
                            <span class="material-icons-outlined" style="font-size: 0.875rem;">drag_indicator</span>
                        </div>
                        <div class="queue-item-preview">
                            ${previewUrl ?
                                `<img src="${previewUrl}" alt="" loading="lazy">` :
                                '<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;"><span class="material-icons-outlined" style="color: hsl(var(--muted-foreground)); font-size: 2rem;">image</span></div>'
                            }
                        </div>
                        <div class="queue-item-info">
                            <div class="queue-item-name">${patternName}</div>
                            <div class="queue-item-index">#${index + 1}</div>
                        </div>
                        <div class="queue-item-actions">
                            <button class="queue-item-action-btn" onclick="moveQueueItemToPosition(${index}, ${upcomingFiles[0].index})" ${isFirst ? 'disabled' : ''} title="Move to top">
                                <span class="material-icons-outlined" style="font-size: 0.875rem;">vertical_align_top</span>
                            </button>
                            <button class="queue-item-action-btn" onclick="moveQueueItemToPosition(${index}, ${upcomingFiles[upcomingFiles.length - 1].index})" ${isLast ? 'disabled' : ''} title="Move to bottom">
                                <span class="material-icons-outlined" style="font-size: 0.875rem;">vertical_align_bottom</span>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            // Add drag and drop event listeners
            setupDragAndDrop();
        }

        // Fetch queue preview image
        async function fetchQueuePreview(file) {
            try {
                const encodedPath = file.replace(/\//g, '--');
                const url = `${API_BASE}/preview/${encodedPath}`;

                // Test if image exists
                const img = new Image();
                img.onload = () => {
                    queuePreviews[file] = url;
                    renderQueue(); // Re-render to show the preview
                };
                img.onerror = () => {
                    queuePreviews[file] = null;
                };
                img.src = url;
            } catch (error) {
                console.error('Error fetching queue preview:', error);
                queuePreviews[file] = null;
            }
        }

        // Setup drag and drop for queue reordering
        function setupDragAndDrop() {
            const items = document.querySelectorAll('.queue-item');

            items.forEach(item => {
                item.addEventListener('dragstart', handleDragStart);
                item.addEventListener('dragend', handleDragEnd);
                item.addEventListener('dragover', handleDragOver);
                item.addEventListener('drop', handleDrop);
                item.addEventListener('dragleave', handleDragLeave);
            });
        }

        function handleDragStart(e) {
            draggedElement = e.currentTarget;
            draggedIndex = parseInt(draggedElement.dataset.index);
            e.currentTarget.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        }

        function handleDragEnd(e) {
            e.currentTarget.classList.remove('dragging');
            document.querySelectorAll('.queue-item').forEach(item => {
                item.classList.remove('drag-over');
            });
            draggedElement = null;
            draggedIndex = null;
        }

        function handleDragOver(e) {
            if (e.preventDefault) {
                e.preventDefault();
            }
            e.dataTransfer.dropEffect = 'move';

            const target = e.currentTarget;
            if (target !== draggedElement) {
                target.classList.add('drag-over');
            }

            return false;
        }

        function handleDragLeave(e) {
            e.currentTarget.classList.remove('drag-over');
        }

        async function handleDrop(e) {
            if (e.stopPropagation) {
                e.stopPropagation();
            }

            const targetElement = e.currentTarget;
            targetElement.classList.remove('drag-over');

            if (draggedElement !== targetElement) {
                const targetIndex = parseInt(targetElement.dataset.index);
                await reorderQueue(draggedIndex, targetIndex);
            }

            return false;
        }

        // Reorder queue items
        async function reorderQueue(fromIndex, toIndex) {
            try {
                const response = await fetch(`${API_BASE}/reorder_queue`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        from_index: fromIndex,
                        to_index: toIndex
                    })
                });

                if (!response.ok) throw new Error('Failed to reorder');

                // Re-render queue after successful reorder
                setTimeout(renderQueue, 100);
            } catch (error) {
                console.error('Error reordering queue:', error);
                showToast('Failed to reorder', 'error');
            }
        }

        // Move queue item to specific position
        async function moveQueueItemToPosition(fromIndex, toIndex) {
            await reorderQueue(fromIndex, toIndex);
        }

        // Event listeners
        document.getElementById('searchInput').addEventListener('input', (e) => {
            searchQuery = e.target.value;
            document.getElementById('clearSearch').style.display = searchQuery ? 'block' : 'none';
            renderPatterns();
        });

        document.getElementById('clearSearch').addEventListener('click', () => {
            searchQuery = '';
            document.getElementById('searchInput').value = '';
            document.getElementById('clearSearch').style.display = 'none';
            renderPatterns();
        });

        document.getElementById('sortBy').addEventListener('change', (e) => {
            sortBy = e.target.value;
            renderPatterns();
        });

        document.getElementById('sortDirection').addEventListener('click', () => {
            sortAsc = !sortAsc;
            const btn = document.getElementById('sortDirection');
            btn.querySelector('span').textContent = sortAsc ? 'arrow_upward' : 'arrow_downward';
            btn.title = sortAsc ? 'Ascending' : 'Descending';
            renderPatterns();
        });

        document.getElementById('pauseBtn').addEventListener('click', togglePause);
        document.getElementById('stopBtn').addEventListener('click', stop);
        document.getElementById('clearBtn').addEventListener('click', clear);

        // Pre-execution option selection
        document.querySelectorAll('.pre-execution-option').forEach(option => {
            option.addEventListener('click', () => {
                document.querySelectorAll('.pre-execution-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                option.classList.add('selected');
                preExecution = option.dataset.value;
            });
        });

        // Panel play button
        document.getElementById('panelPlayBtn').addEventListener('click', playPatternFromPanel);

        // Panel queue buttons
        document.getElementById('panelPlayNextBtn').addEventListener('click', () => addToQueue('next'));
        document.getElementById('panelAddToQueueBtn').addEventListener('click', () => addToQueue('end'));

        // Speed slider
        document.getElementById('speedSlider').addEventListener('input', (e) => {
            speed = parseFloat(e.target.value);
            document.getElementById('speedValue').textContent = `${speed}x`;
        });

        // Progress slider
        document.getElementById('progressSlider').addEventListener('input', (e) => {
            progress = parseFloat(e.target.value);
            currentIndex = Math.floor((progress / 100) * (coordinates.length - 1));
            document.getElementById('progressValue').textContent = `${Math.round(progress)}%`;

            if (canvas && coordinates.length > 0) {
                drawPattern(coordinates, currentIndex);
            }
        });

        // Initialize
        fetchPatterns();
        connectWebSocket();
    </script>
</body>
</html>
"""


class SimpleHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Custom request handler to serve the interface."""

    def do_GET(self):
        """Handle GET requests."""
        if self.path == '/' or self.path == '/index.html':
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            html = HTML_TEMPLATE.replace('__API_BASE_URL__', API_BASE_URL)
            self.wfile.write(html.encode('utf-8'))
        else:
            self.send_error(404, "Not Found")

    def log_message(self, format, *args):
        """Custom logging."""
        print(f"[{self.log_date_time_string()}] {format % args}")


def main():
    """Run the simple HTTP server."""
    print(f"""
╔══════════════════════════════════════════════════════════════╗
║           Simple Sand Table Control Interface                ║
╚══════════════════════════════════════════════════════════════╝

Server starting on http://{HOST}:{PORT}
Backend API: {API_BASE_URL}

Make sure the main backend server is running at {API_BASE_URL}!

Press Ctrl+C to stop the server.
""")

    try:
        with socketserver.TCPServer((HOST, PORT), SimpleHTTPRequestHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
    except Exception as e:
        print(f"\nError: {e}")


if __name__ == "__main__":
    main()

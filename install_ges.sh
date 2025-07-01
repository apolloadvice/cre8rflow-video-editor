#!/bin/bash

# GStreamer Editing Services Installation Script for macOS
# This script installs the necessary dependencies for GES integration

set -e  # Exit on any error

echo "🎬 Installing GStreamer Editing Services for macOS"
echo "=================================================="

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    echo "❌ Homebrew is not installed. Please install Homebrew first:"
    echo "   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    exit 1
fi

echo "✅ Homebrew detected"

# Update Homebrew
echo "📦 Updating Homebrew..."
brew update

# Install GStreamer and GES
echo "📦 Installing GStreamer and GES..."
brew install \
    gstreamer \
    gst-plugins-base \
    gst-plugins-good \
    gst-plugins-bad \
    gst-plugins-ugly \
    gst-editing-services \
    gst-python \
    pygobject3 \
    gtk+3

# Install Python dependencies
echo "🐍 Installing Python dependencies..."
pip install PyGObject

# Set environment variables for GStreamer
echo "🔧 Setting up environment variables..."

# Add to shell profile
PROFILE_FILE=""
if [[ "$SHELL" == *"zsh"* ]]; then
    PROFILE_FILE="$HOME/.zshrc"
elif [[ "$SHELL" == *"bash"* ]]; then
    PROFILE_FILE="$HOME/.bash_profile"
fi

if [[ -n "$PROFILE_FILE" ]]; then
    echo "" >> "$PROFILE_FILE"
    echo "# GStreamer Environment Variables" >> "$PROFILE_FILE"
    echo "export GST_PLUGIN_PATH=/opt/homebrew/lib/gstreamer-1.0:/usr/local/lib/gstreamer-1.0" >> "$PROFILE_FILE"
    echo "export GST_PLUGIN_SYSTEM_PATH=/opt/homebrew/lib/gstreamer-1.0:/usr/local/lib/gstreamer-1.0" >> "$PROFILE_FILE"
    echo "export GI_TYPELIB_PATH=/opt/homebrew/lib/girepository-1.0:/usr/local/lib/girepository-1.0" >> "$PROFILE_FILE"
    echo "export PKG_CONFIG_PATH=/opt/homebrew/lib/pkgconfig:/usr/local/lib/pkgconfig" >> "$PROFILE_FILE"
    echo "" >> "$PROFILE_FILE"
    
    echo "✅ Environment variables added to $PROFILE_FILE"
    echo "⚠️  Please restart your terminal or run: source $PROFILE_FILE"
fi

# Set environment variables for current session
export GST_PLUGIN_PATH=/opt/homebrew/lib/gstreamer-1.0:/usr/local/lib/gstreamer-1.0
export GST_PLUGIN_SYSTEM_PATH=/opt/homebrew/lib/gstreamer-1.0:/usr/local/lib/gstreamer-1.0
export GI_TYPELIB_PATH=/opt/homebrew/lib/girepository-1.0:/usr/local/lib/girepository-1.0
export PKG_CONFIG_PATH=/opt/homebrew/lib/pkgconfig:/usr/local/lib/pkgconfig

# Test the installation
echo "🧪 Testing GES installation..."
python3 backend/test_ges.py

echo ""
echo "🎉 GStreamer Editing Services installation complete!"
echo ""
echo "Next steps:"
echo "1. Restart your terminal or run: source $PROFILE_FILE"
echo "2. Start the backend server: cd backend && python -m uvicorn app.backend.main:app --reload --port 8000"
echo "3. Start the frontend: cd frontend && npm run dev"
echo "4. Toggle to GES mode in the video player using the 'GES' button"
echo ""
echo "Troubleshooting:"
echo "- If you get import errors, try: brew reinstall pygobject3 gst-python"
echo "- If GES timeline creation fails, ensure video files are in supported formats (MP4, MOV, etc.)"
echo "- Check the browser console for GES API communication logs" 
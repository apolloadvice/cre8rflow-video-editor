import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface ContextMenuActionData {
  clipId?: string;
  timelinePosition?: number;
  menuType: 'clip' | 'timeline' | 'empty';
}

interface TimelineContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  onClose: () => void;
  menuType: 'clip' | 'timeline' | 'empty';
  selectedClipId?: string | null;
  clipCount?: number;
  timelinePosition?: number;
  onAction: (action: string, data?: ContextMenuActionData) => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
  submenu?: MenuItem[];
  destructive?: boolean;
}

const TimelineContextMenu: React.FC<TimelineContextMenuProps> = ({
  visible,
  x,
  y,
  onClose,
  menuType,
  selectedClipId,
  clipCount = 0,
  timelinePosition = 0,
  onAction
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click or escape key
  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [visible, onClose]);

  // Adjust menu position to stay within viewport
  const getMenuStyle = () => {
    if (!menuRef.current) return { left: x, top: y };

    const menuRect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    // Adjust horizontal position
    if (x + menuRect.width > viewportWidth) {
      adjustedX = viewportWidth - menuRect.width - 10;
    }

    // Adjust vertical position
    if (y + menuRect.height > viewportHeight) {
      adjustedY = viewportHeight - menuRect.height - 10;
    }

    return { left: Math.max(0, adjustedX), top: Math.max(0, adjustedY) };
  };

  const handleMenuItemClick = (menuItem: MenuItem, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (menuItem.disabled || menuItem.separator) return;

    onAction(menuItem.id, {
      clipId: selectedClipId,
      timelinePosition,
      menuType
    });
    onClose();
  };

  // Generate menu items based on context
  const getMenuItems = (): MenuItem[] => {
    const baseItems: MenuItem[] = [];
    const isMultipleSelection = clipCount > 1;

    if (menuType === 'clip' && selectedClipId) {
      // Multi-selection bulk operations
      if (isMultipleSelection) {
        baseItems.push(
          { id: 'bulk_operations_header', label: `Bulk Operations (${clipCount} clips)`, icon: '🎯' },
          { id: 'separator_bulk1', label: '', separator: true },
          { id: 'bulk_copy', label: 'Copy All Selected', icon: '📋', shortcut: 'Ctrl+C' },
          { id: 'bulk_delete', label: 'Delete All Selected', icon: '🗑️', shortcut: 'Del', destructive: true },
          { id: 'bulk_move', label: 'Move to Timeline Position', icon: '🔄' },
          { id: 'separator_bulk2', label: '', separator: true }
        );
      }
      
      // Regular clip-specific menu items
      baseItems.push(
        { id: 'cut_clip', label: 'Cut', icon: '✂️', shortcut: 'Ctrl+X' },
        { id: 'copy_clip', label: 'Copy', icon: '📋', shortcut: 'Ctrl+C' },
        { id: 'delete_clip', label: 'Delete', icon: '🗑️', shortcut: 'Del', destructive: true },
        { id: 'separator1', label: '', separator: true },
        { id: 'duplicate_clip', label: 'Duplicate', icon: '📄', shortcut: 'Ctrl+D' },
        { id: 'split_clip', label: 'Split at Playhead', icon: '✂️', shortcut: 'S' },
        { id: 'separator2', label: '', separator: true },
        
        // Ripple operations submenu
        {
          id: 'ripple_operations',
          label: 'Ripple Operations',
          icon: '🌊',
          submenu: [
            { id: 'ripple_delete', label: 'Ripple Delete', icon: '🗑️', destructive: true },
            { id: 'ripple_insert', label: 'Insert Gap', icon: '➕' },
            { id: 'ripple_trim', label: 'Ripple Trim', icon: '✂️' }
          ]
        },
        
        { id: 'separator3', label: '', separator: true },
        { id: 'clip_properties', label: 'Properties', icon: '⚙️', shortcut: 'Ctrl+I' }
      );
    } else if (menuType === 'timeline' || menuType === 'empty') {
      // Bulk operations for multiple selected clips
      if (isMultipleSelection) {
        baseItems.push(
          { id: 'bulk_operations_header', label: `${clipCount} clips selected`, icon: '🎯' },
          { id: 'separator_bulk1', label: '', separator: true },
          { id: 'bulk_copy', label: 'Copy Selected Clips', icon: '📋', shortcut: 'Ctrl+C' },
          { id: 'bulk_delete', label: 'Delete Selected Clips', icon: '🗑️', shortcut: 'Del', destructive: true },
          { id: 'separator_bulk2', label: '', separator: true }
        );
      }
      
      // Timeline/empty space menu items
      baseItems.push(
        { id: 'paste_clip', label: 'Paste', icon: '📋', shortcut: 'Ctrl+V', disabled: !selectedClipId },
        { id: 'separator1', label: '', separator: true },
        { id: 'select_all', label: 'Select All Clips', icon: '🎯', shortcut: 'Ctrl+A' },
        { id: 'deselect_all', label: 'Deselect All', icon: '❌', shortcut: 'Esc', disabled: clipCount === 0 },
        { id: 'separator2', label: '', separator: true },
        
        // Timeline operations
        { id: 'add_marker', label: 'Add Marker', icon: '📍', shortcut: 'M' },
        { id: 'add_text', label: 'Add Text Clip', icon: '📝' },
        { id: 'separator3', label: '', separator: true },
        
        // Zoom operations
        {
          id: 'zoom_operations',
          label: 'Zoom',
          icon: '🔍',
          submenu: [
            { id: 'zoom_fit', label: 'Zoom to Fit', icon: '↔️', shortcut: 'Ctrl+0' },
            { id: 'zoom_selection', label: 'Zoom to Selection', icon: '🎯', disabled: !selectedClipId },
            { id: 'zoom_in', label: 'Zoom In', icon: '🔍', shortcut: 'Ctrl+=' },
            { id: 'zoom_out', label: 'Zoom Out', icon: '🔍', shortcut: 'Ctrl+-' }
          ]
        },
        
        { id: 'separator4', label: '', separator: true },
        { id: 'timeline_properties', label: 'Timeline Properties', icon: '⚙️' }
      );
    }

    return baseItems;
  };

  const renderMenuItem = (menuItem: MenuItem, isSubmenu: boolean = false) => {
    if (menuItem.separator) {
      return (
        <div key={menuItem.id} className="h-px bg-cre8r-gray-700 my-1" />
      );
    }

    const hasSubmenu = menuItem.submenu && menuItem.submenu.length > 0;

    return (
      <div
        key={menuItem.id}
        className={cn(
          "relative px-3 py-2 text-sm cursor-pointer transition-colors select-none",
          "hover:bg-cre8r-gray-700 flex items-center justify-between",
          menuItem.disabled && "opacity-50 cursor-not-allowed hover:bg-transparent",
          menuItem.destructive && !menuItem.disabled && "text-red-400 hover:text-red-300 hover:bg-red-900/20",
          isSubmenu && "px-2 py-1.5 text-xs"
        )}
        onClick={(e) => !hasSubmenu && handleMenuItemClick(menuItem, e)}
      >
        <div className="flex items-center gap-2">
          {menuItem.icon && (
            <span className="text-xs opacity-70">{menuItem.icon}</span>
          )}
          <span>{menuItem.label}</span>
        </div>
        
        <div className="flex items-center gap-2">
          {menuItem.shortcut && (
            <span className="text-xs opacity-50 font-mono">{menuItem.shortcut}</span>
          )}
          {hasSubmenu && (
            <span className="text-xs opacity-70">▶</span>
          )}
        </div>

        {/* Submenu */}
        {hasSubmenu && (
          <div className="absolute left-full top-0 ml-1 hidden group-hover:block">
            <div className="bg-cre8r-gray-800 border border-cre8r-gray-700 rounded-md shadow-lg py-1 min-w-48">
              {menuItem.submenu!.map(subItem => renderMenuItem(subItem, true))}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (!visible) return null;

  const menuItems = getMenuItems();
  const menuStyle = getMenuStyle();

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      <div
        ref={menuRef}
        className="absolute bg-cre8r-gray-800 border border-cre8r-gray-700 rounded-md shadow-lg py-1 min-w-48 pointer-events-auto"
        style={menuStyle}
      >
        {/* Menu header */}
        <div className="px-3 py-1 text-xs text-cre8r-gray-400 border-b border-cre8r-gray-700">
          {menuType === 'clip' ? `Clip: ${selectedClipId}` : 
           menuType === 'timeline' ? `Timeline @ ${timelinePosition.toFixed(2)}s` : 
           'Timeline'}
        </div>

        {/* Menu items */}
        <div className="py-1">
          {menuItems.map(menuItem => renderMenuItem(menuItem))}
        </div>

        {/* Menu footer with shortcuts hint */}
        <div className="px-3 py-1 text-xs text-cre8r-gray-500 border-t border-cre8r-gray-700">
          Right-click for context menu
        </div>
      </div>
    </div>
  );
};

export default TimelineContextMenu; 
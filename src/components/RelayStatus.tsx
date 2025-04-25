import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import { FiSettings } from 'react-icons/fi';

// Define the interface for the imperative methods
export interface RelayStatusHandle {
  focusSettingsButton: () => void;
}

interface RelayStatusProps {
  connectedCount: number;
  totalCount: number; // Keep prop for title, but don't display fraction
  onOpenSettings: () => void; // Callback to open the actual modal
}

// Keep forwardRef to allow focusing the button from parent
const RelayStatus = forwardRef<RelayStatusHandle, RelayStatusProps>(
  ({ connectedCount, totalCount, onOpenSettings }, ref) => {
    const settingsButtonRef = useRef<HTMLButtonElement>(null); // Ref for the button

    // Expose the focus method via useImperativeHandle
    useImperativeHandle(ref, () => ({
      focusSettingsButton: () => {
        settingsButtonRef.current?.focus();
      },
    }));

    return (
      // Use group class for focus-within styling
      <div className="group absolute bottom-2 left-2 flex items-center space-x-1 p-1 rounded-md bg-black/40 backdrop-blur-sm z-10">
        {/* Relay Count Display (Only connected count) */}
        <span 
          className={`text-xs font-semibold ${connectedCount > 0 ? 'text-green-400' : 'text-yellow-500'}`}
          title={`${connectedCount}/${totalCount} relays connected`}
        >
          {connectedCount} {/* Display only connected count */}
        </span>

        {/* Hidden Settings Button - appears on focus */}
        <button
          ref={settingsButtonRef} // Attach the ref here
          onClick={onOpenSettings}
          // Use opacity-0, group-focus-within:opacity-100, and focus:opacity-100
          className="p-0.5 rounded text-gray-400 opacity-0 group-focus-within:opacity-100 focus:opacity-100 hover:text-white focus:text-white focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-black focus:outline-none transition-all duration-150"
          aria-label="Open Settings"
          tabIndex={0} // Ensure it's focusable
        >
          <FiSettings size={16} />
        </button>
      </div>
    );
  }
);

// Add display name for DevTools
RelayStatus.displayName = 'RelayStatus';

export default RelayStatus; 
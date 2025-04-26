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

    // Determine text color based on connection status (optional enhancement)
    const textColor = connectedCount > 0 ? 'text-green-400' : 'text-yellow-500';

    return (
      // Use group class and relative positioning on the container
      <div className="group relative w-fit h-fit p-1 rounded-md bg-black/40 backdrop-blur-sm z-10">
        {/* Relay Count Display (Base Layer) */}
        <span 
          className={`text-xs font-semibold ${textColor}`}
          title={`${connectedCount}/${totalCount} relays connected`}
        >
          {connectedCount} {/* Display only connected count */}
        </span>

        {/* Hidden Settings Button - appears on focus, positioned over the number */}
        <button
          ref={settingsButtonRef} // Attach the ref here
          onClick={onOpenSettings}
          // Absolute position, cover parent, center icon, hide by default
          className={`absolute inset-0 flex items-center justify-center p-0.5 rounded text-purple-400 
                     opacity-0 group-focus-within:opacity-100 focus:opacity-100 
                     hover:text-white focus:text-white 
                     focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:ring-offset-black 
                     focus:outline-none transition-opacity duration-150`}
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
const NotificationSystem = {
    show: (message, type = "info", duration = 3000, onClick = null) => {
        // Remove any existing notifications first
        const existingNotifications = document.querySelectorAll('[style*="position: fixed"][style*="bottom: 20px"][style*="right: 20px"]');
        existingNotifications.forEach(notification => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        });

        const notification = document.createElement("div");
        notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 16px 20px;
    border-radius: 12px;
    color: #374151;
    font-size: 14px;
    font-weight: 500;
    z-index: 10000;
    transform: translateX(100%);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    max-width: 350px;
    min-width: 280px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05);
    display: flex;
    align-items: flex-start;
    gap: 12px;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
  `;

        // Set background and icon based on type
        let icon;
        let bgColor = "var(--background-alt-color)"

        switch (type) {
            case "success":
                notification.style.borderLeft = "4px solid #10b981";
                icon = `<svg width="20" height="20" fill="var(--success-color)" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
      </svg>`;
                break;
            case "error":
                notification.style.borderLeft = "4px solid var(--error-color)";
                icon = `<svg width="20" height="20" fill="#ef4444" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
      </svg>`;
                break;
            case "warning":
                notification.style.borderLeft = "4px solid var(--warning-color)";
                icon = `<svg width="20" height="20" fill="#f59e0b" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
      </svg>`;
                break;
            default:
                notification.style.borderLeft = "4px solid #3b82f6";
                icon = `<svg width="20" height="20" fill="var(--info-color)" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M11 6a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
      </svg>`;
        }

        notification.style.backgroundColor = bgColor;

        // Create icon element
        const iconEl = document.createElement("div");
        iconEl.innerHTML = icon;
        iconEl.style.cssText = `
    flex-shrink: 0;
    margin-top: 1px;
  `;

        // Create content container
        const contentEl = document.createElement("div");
        contentEl.style.cssText = `
    flex: 1;
    line-height: 1.5;
  `;

        // Create message element
        const messageEl = document.createElement("div");
        messageEl.innerHTML = message;
        messageEl.style.cssText = `
    color: var(--primary-color);
    font-weight: 500;
  `;

        // Create close button
        const closeBtn = document.createElement("button");
        closeBtn.innerHTML = `<svg width="16" height="16" fill="var(--muted-text-color)" viewBox="0 0 20 20">
    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
  </svg>`;
        closeBtn.style.cssText = `
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    margin: -4px -4px -4px 4px;
    border-radius: 6px;
    transition: all 0.2s ease;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    
  `;

        // Add hover effect to close button
        closeBtn.addEventListener("mouseenter", () => {
            closeBtn.style.backgroundColor = "#f3f4f6";
            closeBtn.querySelector('svg').setAttribute('fill', '#6b7280');
        });
        closeBtn.addEventListener("mouseleave", () => {
            closeBtn.style.backgroundColor = "transparent";
            closeBtn.querySelector('svg').setAttribute('fill', '#9ca3af');
        });

        // Function to remove notification
        const removeNotification = () => {
            notification.style.transform = "translateX(100%)";
            notification.style.opacity = "0";
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        };

        // Close button click handler
        closeBtn.addEventListener("click", removeNotification);

        // Add click handler if provided
        if (onClick) {
            notification.style.cursor = 'pointer';
            notification.addEventListener('click', (e) => {
                // Don't trigger if clicking the close button
                if (e.target === closeBtn || closeBtn.contains(e.target)) {
                    return;
                }
                onClick();
                removeNotification();
            });
        }

        // Append elements
        contentEl.appendChild(messageEl);
        notification.appendChild(iconEl);
        notification.appendChild(contentEl);
        notification.appendChild(closeBtn);
        document.body.appendChild(notification);

        // Animate in
        requestAnimationFrame(() => {
            notification.style.transform = "translateX(0)";
            notification.style.opacity = "1";
        });

        // Auto-remove after duration
        const autoRemoveTimer = setTimeout(removeNotification, duration);

        // Clear timer if manually closed
        closeBtn.addEventListener("click", () => {
            clearTimeout(autoRemoveTimer);
        });

        // Add pause on hover
        notification.addEventListener("mouseenter", () => {
            clearTimeout(autoRemoveTimer);
        });

        notification.addEventListener("mouseleave", () => {
            setTimeout(removeNotification, 1000); // Give 1 second after mouse leave
        });
    },
};

export default NotificationSystem;
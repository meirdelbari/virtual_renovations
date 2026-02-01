(function() {
    // 1. Configuration
    // In production, this would be your actual domain (e.g., https://app.algoreitai.com)
    // We try to auto-detect the domain based on where this script was loaded from.
    var scriptEl = document.currentScript;
    var scriptSource = scriptEl ? scriptEl.src : 'http://localhost:4000/widget.js';
    var scriptUrlObj = new URL(scriptSource);
    var baseUrl = scriptUrlObj.origin; 
    
    // Parse configuration from script URL parameters
    var config = {
        supplierId: scriptUrlObj.searchParams.get("supplierId") || null
    }; 
    
    // Prevent double loading
    if (document.getElementById('algoreit-ai-root')) return;

    console.log("AlgoreitAI Widget Loading from:", baseUrl);

    // 2. Styles (match main app button look)
    var styles = `
        :root {
            --color-border-subtle: #e0e0ea;
            --color-text-main: #111827;
        }
        .op-btn {
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 8px 18px;
            border-radius: 999px;
            border: 1px solid var(--color-border-subtle);
            background: #ffffff;
            color: var(--color-text-main);
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.05s ease, border-color 0.15s ease;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .op-btn:hover {
            background: #f9fafb;
            box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
        }
        .op-btn:active {
            transform: translateY(1px);
            box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08);
        }
        .op-btn-gemini {
            background: linear-gradient(135deg, #4285f4, #34a853, #fbbc04, #ea4335);
            color: #ffffff;
            border-color: transparent;
            box-shadow: 0 4px 12px rgba(66, 133, 244, 0.3);
            font-weight: 600;
        }
        .op-btn-gemini:hover {
            background: linear-gradient(135deg, #3367d6, #2d8e47, #f9ab00, #d33b2c);
            box-shadow: 0 6px 16px rgba(66, 133, 244, 0.4);
        }
        .op-btn-gemini:disabled {
            opacity: 0.7;
            cursor: not-allowed;
            transform: none;
        }
        .algoreit-btn {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 2147483640; /* Very high z-index */
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }
        .algoreit-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background-color: rgba(0,0,0,0.5);
            z-index: 2147483645;
            display: none; /* Hidden by default */
            justify-content: center;
            align-items: center;
            backdrop-filter: blur(4px);
            opacity: 0;
            transition: opacity 0.3s ease;
        }
        .algoreit-modal-content {
            width: 90%;
            height: 90%;
            max-width: 1400px;
            background: white;
            border-radius: 16px;
            overflow: hidden;
            position: relative;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            transform: scale(0.95);
            transition: transform 0.3s ease;
        }
        .algoreit-modal-close {
            position: absolute;
            top: 15px;
            right: 15px;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: white;
            border: 1px solid #e2e8f0;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            color: #64748b;
            z-index: 10;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            transition: all 0.2s;
        }
        .algoreit-modal-close:hover {
            background: #f1f5f9;
            color: #0f172a;
        }
        .algoreit-iframe {
            width: 100%;
            height: 100%;
            border: none;
            background: #fff;
        }
        /* Open state classes */
        .algoreit-modal-overlay.is-open {
            display: flex;
            opacity: 1;
        }
        .algoreit-modal-overlay.is-open .algoreit-modal-content {
            transform: scale(1);
        }
    `;

    var styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    // 3. Create Elements
    var root = document.createElement('div');
    root.id = 'algoreit-ai-root';

    // Button
    var btn = document.createElement('button');
    btn.className = 'algoreit-btn op-btn op-btn-gemini';
    btn.innerHTML = '<span>✨</span> AlgoreitAI';
    // Ensure consistent placement for demos
    btn.style.position = 'fixed';
    btn.style.setProperty('bottom', '15px', 'important');
    btn.style.setProperty('right', '20px', 'important');
    btn.style.zIndex = '2147483640';
    
    // Modal Container
    var modalOverlay = document.createElement('div');
    modalOverlay.className = 'algoreit-modal-overlay';
    
    var modalContent = document.createElement('div');
    modalContent.className = 'algoreit-modal-content';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'algoreit-modal-close';
    closeBtn.innerHTML = '×';
    closeBtn.ariaLabel = 'Close';

    // Iframe (Lazy loaded on first click to save performance)
    var iframe = null;

    // 4. Logic
    function openModal() {
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.className = 'algoreit-iframe';
            // Add mode=embed to hide headers if supported by app
            var params = new URLSearchParams();
            params.set('mode', 'embed');
            
            // Pass supplierId if configured in script tag
            if (config.supplierId) {
                params.set('supplierId', config.supplierId);
            }

            try {
                if (window.location && window.location.hostname) {
                    params.set('supplierHost', window.location.hostname);
                }
            } catch (_) {}
            iframe.src = baseUrl + '/index.html?' + params.toString();
            iframe.allow = "camera; microphone; clipboard-write; clipboard-read";
            modalContent.appendChild(iframe);
        }
        
        modalOverlay.classList.add('is-open');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }

    function closeModal() {
        modalOverlay.classList.remove('is-open');
        document.body.style.overflow = ''; // Restore scrolling
        
        // Optional: Reset iframe or keep state? 
        // Keeping state is usually better for UX so they don't lose progress.
    }

    // Event Listeners
    btn.onclick = openModal;
    closeBtn.onclick = closeModal;
    
    // Close on click outside
    modalOverlay.onclick = function(e) {
        if (e.target === modalOverlay) {
            closeModal();
        }
    };

    // 5. Assemble
    modalContent.appendChild(closeBtn);
    modalOverlay.appendChild(modalContent);
    
    root.appendChild(btn);
    root.appendChild(modalOverlay);
    
    document.body.appendChild(root);

})();
document.addEventListener('DOMContentLoaded', async () => {
    // --- Helper to load scripts dynamically ---
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load script ${src}`));
            document.head.appendChild(script);
        });
    }

    // --- Load local library fallbacks if CDN scripts fail ---
    async function loadFallbackLibraries() {
        const loadPromises = [];
        if (typeof QRCode === 'undefined') {
            console.warn('QRCode CDN blocked/unavailable. Loading local fallback...');
            loadPromises.push(loadScript('lib/qrcode.min.js'));
        }
        if (typeof JsBarcode === 'undefined') {
            console.warn('JsBarcode CDN blocked/unavailable. Loading local fallback...');
            loadPromises.push(loadScript('lib/JsBarcode.all.min.js'));
        }

        if (loadPromises.length > 0) {
            try {
                await Promise.all(loadPromises);
                console.log('Local fallback libraries loaded successfully.');
            } catch (error) {
                console.error('Could not load fallback libraries:', error);
            }
        }
    }

    // Wait for libraries to load before continuing
    await loadFallbackLibraries();

    // --- Application State ---
    let activeMode = 'qr'; // 'qr' or 'barcode'
    let isGenerating = false;

    // --- DOM Elements ---
    // Theme Toggle
    const themeToggleBtn = document.getElementById('theme-toggle');
    
    // Tabs
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    // Inputs & Validation
    const codeInput = document.getElementById('code-input');
    const inputLabelText = document.getElementById('input-label-text');
    const charCounter = document.getElementById('char-counter');
    const clearInputBtn = document.getElementById('clear-input-btn');
    const validationMsg = document.getElementById('validation-msg');
    
    // Customization Option Blocks
    const qrOptions = document.getElementById('qr-options');
    const barcodeOptions = document.getElementById('barcode-options');
    
    // QR Settings
    const qrSizeSelect = document.getElementById('qr-size');
    const qrFgColorInput = document.getElementById('qr-fg-color');
    const qrBgColorInput = document.getElementById('qr-bg-color');
    
    // Barcode Settings
    const barcodeShowText = document.getElementById('barcode-show-text');
    const barcodeFgColorInput = document.getElementById('barcode-fg-color');
    const barcodeBgColorInput = document.getElementById('barcode-bg-color');
    
    // Color Pickers Values text (HEX)
    const colorPickers = document.querySelectorAll('input[type="color"]');
    
    // Action Buttons
    const generateBtn = document.getElementById('generate-btn');
    const resetAllBtn = document.getElementById('reset-all-btn');
    
    // Preview States
    const emptyState = document.getElementById('preview-empty-state');
    const loadingState = document.getElementById('preview-loading-state');
    const successState = document.getElementById('preview-success-state');
    
    // Output Areas
    const qrOutput = document.getElementById('qr-output');
    const barcodeOutputWrapper = document.getElementById('barcode-output-wrapper');
    const barcodeOutput = document.getElementById('barcode-output');
    
    // Success Actions
    const downloadBtn = document.getElementById('download-btn');
    const copyBtn = document.getElementById('copy-btn');
    const toastContainer = document.getElementById('toast-container');

    // --- Initialize Icons ---
    lucide.createIcons();

    // --- Theme Manager ---
    function initTheme() {
        const savedTheme = localStorage.getItem('theme');
        const userPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
        } else if (userPrefersDark) {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
        }
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        showToast(`Switched to ${newTheme === 'dark' ? 'Dark' : 'Light'} Mode`, 'info');
    }

    themeToggleBtn.addEventListener('click', toggleTheme);
    initTheme();

    // --- Tab Switcher Logic ---
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const selectedMode = button.getAttribute('data-mode');
            if (selectedMode === activeMode) return;

            // Update Tab UI
            tabButtons.forEach(btn => {
                btn.classList.remove('active');
                btn.setAttribute('aria-selected', 'false');
            });
            button.classList.add('active');
            button.setAttribute('aria-selected', 'true');

            // Switch Active Mode
            activeMode = selectedMode;
            document.body.setAttribute('data-active-mode', activeMode);

            // Toggle Customization Options
            if (activeMode === 'qr') {
                qrOptions.classList.remove('hidden');
                barcodeOptions.classList.add('hidden');
                inputLabelText.textContent = 'Enter Content';
                codeInput.placeholder = 'Enter URL, text, email, phone number, or Wi-Fi configuration...';
            } else {
                qrOptions.classList.add('hidden');
                barcodeOptions.classList.remove('hidden');
                inputLabelText.textContent = 'Enter Barcode Value';
                codeInput.placeholder = 'Enter alphanumeric value (CODE128 supports ASCII characters)...';
            }

            // Reset Input Validation state & reset states
            clearValidation();
            updateCharCounter();
            resetPreview();
            
            // Auto-focus input
            codeInput.focus();
        });
    });

    // --- Character Counter & Clear Button ---
    function updateCharCounter() {
        const value = codeInput.value;
        const limit = activeMode === 'qr' ? 500 : 50;
        
        // Enforce maximum length
        if (value.length > limit) {
            codeInput.value = value.substring(0, limit);
        }
        
        charCounter.textContent = `${codeInput.value.length} / ${limit}`;

        // Toggle clear button visibility
        if (codeInput.value.length > 0) {
            clearInputBtn.classList.add('visible');
        } else {
            clearInputBtn.classList.remove('visible');
        }
    }

    codeInput.addEventListener('input', () => {
        updateCharCounter();
        clearValidation();
    });

    clearInputBtn.addEventListener('click', () => {
        codeInput.value = '';
        updateCharCounter();
        clearValidation();
        resetPreview();
        codeInput.focus();
    });

    // --- Color Picker Label Updates ---
    colorPickers.forEach(picker => {
        picker.addEventListener('input', (e) => {
            const hexText = e.target.nextElementSibling;
            if (hexText && hexText.classList.contains('color-val')) {
                hexText.textContent = e.target.value.toUpperCase();
            }
        });
    });

    // --- Validation Functions ---
    function showValidationError(message) {
        validationMsg.textContent = message;
        validationMsg.classList.add('visible');
        codeInput.style.borderColor = 'var(--toast-error-text)';
        codeInput.style.boxShadow = '0 0 0 4px rgba(220, 38, 38, 0.15)';
    }

    function clearValidation() {
        validationMsg.textContent = '';
        validationMsg.classList.remove('visible');
        codeInput.removeAttribute('style');
    }

    function validateInput(text) {
        if (!text.trim()) {
            showValidationError('Input field cannot be empty.');
            return false;
        }

        if (activeMode === 'barcode') {
            // CODE128 supports standard ASCII characters (0-127)
            const asciiRegex = /^[\x00-\x7F]+$/;
            if (!asciiRegex.test(text)) {
                showValidationError('Barcode (CODE128) only supports standard ASCII characters.');
                return false;
            }
        }

        return true;
    }

    // --- Ripple Click Effect ---
    function triggerRipple(e) {
        const button = e.currentTarget;
        const circle = document.createElement('span');
        const diameter = Math.max(button.clientWidth, button.clientHeight);
        const radius = diameter / 2;

        const rect = button.getBoundingClientRect();
        
        circle.style.width = circle.style.height = `${diameter}px`;
        circle.style.left = `${e.clientX - rect.left - radius}px`;
        circle.style.top = `${e.clientY - rect.top - radius}px`;
        circle.classList.add('ripple');

        // Remove old ripples
        const oldRipple = button.querySelector('.ripple');
        if (oldRipple) {
            oldRipple.remove();
        }

        button.appendChild(circle);
    }

    const rippleButtons = document.querySelectorAll('.ripple-effect');
    rippleButtons.forEach(btn => {
        btn.addEventListener('click', triggerRipple);
    });

    // --- Reset Preview Helper ---
    function resetPreview() {
        emptyState.classList.add('active-state');
        emptyState.classList.remove('hidden');
        loadingState.classList.add('hidden');
        successState.classList.add('hidden');
        
        qrOutput.innerHTML = '';
        qrOutput.classList.add('hidden');
        
        barcodeOutputWrapper.classList.add('hidden');
    }

    // --- Code Generation Handlers ---
    function generateCode() {
        const textValue = codeInput.value;

        if (!validateInput(textValue)) {
            showToast('Generation failed. Please check inputs.', 'error');
            return;
        }

        if (isGenerating) return;
        isGenerating = true;

        // Enter loading state
        emptyState.classList.add('hidden');
        emptyState.classList.remove('active-state');
        successState.classList.add('hidden');
        loadingState.classList.remove('hidden');
        
        // Simulating generation delay for premium loading animation
        setTimeout(() => {
            try {
                if (activeMode === 'qr') {
                    renderQRCode(textValue);
                } else {
                    renderBarcode(textValue);
                }
                
                // Show success view
                loadingState.classList.add('hidden');
                successState.classList.remove('hidden');
                
                showToast(`${activeMode === 'qr' ? 'QR Code' : 'Barcode'} generated successfully!`, 'success');
            } catch (error) {
                console.error(error);
                loadingState.classList.add('hidden');
                emptyState.classList.remove('hidden');
                emptyState.classList.add('active-state');
                showValidationError('Failed to generate code. Try different settings.');
                showToast('Generation process encountered an error.', 'error');
            } finally {
                isGenerating = false;
            }
        }, 600);
    }

    // --- QRCode Rendering ---
    function renderQRCode(text) {
        qrOutput.innerHTML = '';
        qrOutput.classList.remove('hidden');
        barcodeOutputWrapper.classList.add('hidden');

        const size = parseInt(qrSizeSelect.value);
        const fgColor = qrFgColorInput.value;
        const bgColor = qrBgColorInput.value;

        // Instantiate davidshimjs qrcode library
        new QRCode(qrOutput, {
            text: text,
            width: size,
            height: size,
            colorDark: fgColor,
            colorLight: bgColor,
            correctLevel: QRCode.CorrectLevel.H
        });

        // Some browsers take a tick to render image correctly inside wrapper
        // Ensure child elements gain success animations
        qrOutput.classList.add('fade-in');
    }

    // --- Barcode Rendering ---
    function renderBarcode(text) {
        qrOutput.classList.add('hidden');
        barcodeOutputWrapper.classList.remove('hidden');

        const showText = barcodeShowText.checked;
        const fgColor = barcodeFgColorInput.value;
        const bgColor = barcodeBgColorInput.value;

        // Clear attributes or elements inside SVG to prevent overlap
        barcodeOutput.innerHTML = '';

        JsBarcode("#barcode-output", text, {
            format: "CODE128",
            displayValue: showText,
            lineColor: fgColor,
            background: bgColor,
            width: 2,
            height: 90,
            fontSize: 15,
            margin: 15,
            valid: function(valid) {
                if (!valid) {
                    throw new Error("JsBarcode validation failed");
                }
            }
        });

        barcodeOutputWrapper.classList.add('fade-in');
    }

    // --- Event Listeners for Generation ---
    generateBtn.addEventListener('click', generateCode);

    // Support trigger on pressing Enter
    codeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            // For QR, allow multiline if Shift+Enter is pressed, otherwise generate
            // For Barcode, single line only, generate immediately
            if (activeMode === 'barcode' || !e.shiftKey) {
                e.preventDefault();
                generateCode();
            }
        }
    });

    // --- Reset All Button ---
    resetAllBtn.addEventListener('click', () => {
        // Reset Inputs
        codeInput.value = '';
        updateCharCounter();
        clearValidation();

        // Reset Settings
        qrSizeSelect.value = '256';
        qrFgColorInput.value = '#0f172a';
        qrFgColorInput.nextElementSibling.textContent = '#0F172A';
        qrBgColorInput.value = '#ffffff';
        qrBgColorInput.nextElementSibling.textContent = '#FFFFFF';

        barcodeShowText.checked = true;
        barcodeFgColorInput.value = '#0f172a';
        barcodeFgColorInput.nextElementSibling.textContent = '#0F172A';
        barcodeBgColorInput.value = '#ffffff';
        barcodeBgColorInput.nextElementSibling.textContent = '#FFFFFF';

        // Reset Preview States
        resetPreview();

        showToast('All fields and configurations reset.', 'info');
    });

    // --- Download Functionality ---
    function downloadPNG() {
        if (activeMode === 'qr') {
            downloadQRCode();
        } else {
            downloadBarcode();
        }
    }

    function downloadQRCode() {
        // QRCode.js creates a canvas and an image inside qrOutput
        const canvas = qrOutput.querySelector('canvas');
        const img = qrOutput.querySelector('img');

        let dataURL = '';

        if (canvas) {
            dataURL = canvas.toDataURL('image/png');
        } else if (img && img.src) {
            dataURL = img.src;
        }

        if (dataURL) {
            triggerFileDownload(dataURL, 'scancraft-qrcode.png');
        } else {
            showToast('Failed to export QR Code image.', 'error');
        }
    }

    function downloadBarcode() {
        // Convert SVG to Canvas, then extract PNG
        const svg = document.getElementById('barcode-output');
        if (!svg) {
            showToast('Failed to find barcode element.', 'error');
            return;
        }

        try {
            const svgString = new XMLSerializer().serializeToString(svg);
            const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
            const URL = window.URL || window.webkitURL || window;
            const blobURL = URL.createObjectURL(svgBlob);
            
            const image = new Image();
            image.onload = function() {
                // Determine dimensions with fallback
                const bbox = svg.getBoundingClientRect();
                const width = svg.width.baseVal.value || bbox.width || 350;
                const height = svg.height.baseVal.value || bbox.height || 150;

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const context = canvas.getContext('2d');
                
                // Draw background color
                context.fillStyle = barcodeBgColorInput.value || '#ffffff';
                context.fillRect(0, 0, width, height);
                
                // Draw SVG image
                context.drawImage(image, 0, 0);
                
                const pngURL = canvas.toDataURL("image/png");
                triggerFileDownload(pngURL, 'scancraft-barcode.png');
                URL.revokeObjectURL(blobURL);
            };
            image.onerror = function() {
                showToast('Failed to rasterize barcode image.', 'error');
            };
            image.src = blobURL;
        } catch (error) {
            console.error(error);
            showToast('Failed to download barcode.', 'error');
        }
    }

    function triggerFileDownload(dataURL, fileName) {
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Image downloaded successfully!', 'success');
    }

    downloadBtn.addEventListener('click', downloadPNG);

    // --- Clipboard Copy Functionality ---
    copyBtn.addEventListener('click', () => {
        const textToCopy = codeInput.value;
        if (!textToCopy) return;

        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                showToast('Text copied to clipboard!', 'success');
            })
            .catch(err => {
                console.error('Could not copy text: ', err);
                showToast('Failed to copy text.', 'error');
            });
    });

    // --- Custom Toast Notifications System ---
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let iconName = 'info';
        if (type === 'success') iconName = 'check-circle';
        if (type === 'error') iconName = 'alert-triangle';

        toast.innerHTML = `
            <i data-lucide="${iconName}"></i>
            <span>${message}</span>
        `;

        toastContainer.appendChild(toast);
        lucide.createIcons();

        // Trigger exit transition before removing
        setTimeout(() => {
            toast.classList.add('toast-exit');
            // Remove from DOM after exit animation completes
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    }
});

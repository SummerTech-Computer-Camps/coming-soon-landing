/**
 * BugPost (Free) — Frontend Widget
 *
 * Simple one-step bug reporting overlay. Captures browser context,
 * console errors, and page load time automatically.
 */
(function () {
    'use strict';

    /* -- Bail if config or jQuery is missing ------------------- */
    if (typeof bugPost === 'undefined' || typeof jQuery === 'undefined') {
        return;
    }

    var C = bugPost;
    var $ = jQuery;

    /* -- State ------------------------------------------------- */
    var state = {
        view: 'form', // 'form' | 'success' | 'error'
        comment: '',
        reporterName: C.userName || '',
        reporterEmail: C.userEmail || '',
        consoleErrors: [],
        loadTime: '',
        resultError: null
    };

    var i18n = C.i18n || {};

    /* -- Console Error Capture --------------------------------- */

    if (C.enableConsoleLog) {
    // Runtime JS errors (TypeError, ReferenceError, SyntaxError, etc.)
    window.addEventListener('error', function (e) {
        if (state.consoleErrors.length >= 20) { return; }

        // Resource loading failures (404s, MIME blocks) — e.target is the element.
        if (e.target && e.target !== window && e.target.tagName) {
            var src = e.target.src || e.target.href || '';
            if (src) {
                state.consoleErrors.push('Failed to load ' + e.target.tagName.toLowerCase() + ': ' + src);
                return;
            }
        }

        // JS runtime errors.
        var msg = e.message || 'Unknown error';
        var loc = (e.filename || '') + ':' + (e.lineno || 0) + ':' + (e.colno || 0);
        state.consoleErrors.push(msg + ' at ' + loc);
    }, true); // useCapture: true to catch resource errors that don't bubble.

    window.addEventListener('unhandledrejection', function (e) {
        if (state.consoleErrors.length < 20) {
            state.consoleErrors.push('Unhandled Promise: ' + (e.reason ? e.reason.toString() : 'unknown'));
        }
    });
    } // end if (C.enableConsoleLog)

    /* -- Page Load Time ---------------------------------------- */
    window.addEventListener('load', function () {
        setTimeout(function () {
            try {
                var perf = window.performance;
                if (perf && perf.getEntriesByType) {
                    var nav = perf.getEntriesByType('navigation');
                    if (nav.length && nav[0].loadEventEnd > 0) {
                        state.loadTime = (nav[0].loadEventEnd / 1000).toFixed(2) + 's';
                        return;
                    }
                }
                if (perf && perf.timing && perf.timing.loadEventEnd > 0) {
                    var t = perf.timing;
                    state.loadTime = ((t.loadEventEnd - t.navigationStart) / 1000).toFixed(2) + 's';
                }
            } catch (ignored) { /* silently fail */ }
        }, 0);
    });

    /* -- Browser / OS Detection -------------------------------- */
    function getBrowser() {
        var ua = navigator.userAgent;
        var match = ua.match(/(?:Chrome|Firefox|Safari|Edg|OPR)\/[\d.]+/);
        var version = match ? match[0] : '';
        var name;
        if (ua.indexOf('Firefox') > -1)      { name = 'Firefox'; }
        else if (ua.indexOf('Edg/') > -1)    { name = 'Edge'; }
        else if (ua.indexOf('OPR/') > -1)    { name = 'Opera'; }
        else if (ua.indexOf('Chrome') > -1)  { name = 'Chrome'; }
        else if (ua.indexOf('Safari') > -1)  { name = 'Safari'; }
        else                                  { name = 'Unknown'; }
        return version ? name + ' (' + version + ')' : name;
    }

    function getOS() {
        var ua = navigator.userAgent;
        if (ua.indexOf('Win') > -1)              { return 'Windows'; }
        if (ua.indexOf('Mac') > -1)              { return 'macOS'; }
        if (ua.indexOf('Linux') > -1)            { return 'Linux'; }
        if (ua.indexOf('Android') > -1)          { return 'Android'; }
        if (/iPhone|iPad|iPod/.test(ua))         { return 'iOS'; }
        return 'Unknown';
    }

    /* -- DOM Building ------------------------------------------ */

    function buildWidget() {
        var root = document.getElementById('bugpost-root');
        if (!root) { return; }

        // Tab button (always right side).
        var tab = document.createElement('button');
        tab.id = 'bugpost-tab';
        tab.style.setProperty('--bp-accent', C.buttonColor);
        tab.style.background = C.buttonColor;
        tab.textContent = i18n.report || 'Report';
        tab.addEventListener('click', openPanel);
        root.appendChild(tab);

        // Overlay backdrop.
        var overlay = document.createElement('div');
        overlay.id = 'bugpost-overlay';
        overlay.addEventListener('click', closePanel);
        root.appendChild(overlay);

        // Panel.
        var panel = document.createElement('div');
        panel.id = 'bugpost-panel';
        root.appendChild(panel);

        renderView();
    }

    /* -- Open / Close ------------------------------------------ */

    function openPanel() {
        document.getElementById('bugpost-tab').classList.add('bp-hidden');
        document.getElementById('bugpost-overlay').classList.add('bp-active');
        document.getElementById('bugpost-panel').classList.add('bp-active');
        state.view = 'form';
        state.comment = '';
        state.resultError = null;
        renderView();
    }

    function closePanel() {
        document.getElementById('bugpost-tab').classList.remove('bp-hidden');
        document.getElementById('bugpost-overlay').classList.remove('bp-active');
        document.getElementById('bugpost-panel').classList.remove('bp-active');
    }

    /* -- View Rendering ---------------------------------------- */

    function renderView() {
        var panel = document.getElementById('bugpost-panel');
        if (!panel) { return; }

        var html = '';

        // Header.
        html += '<div class="bp-header">';
        if (state.view === 'form') {
            html += '<h3>' + escHtml(i18n.reportABug || 'Report a Bug') + '</h3>';
        } else {
            html += '<h3></h3>';
        }
        html += '<button class="bp-close" type="button">&times;</button>';
        html += '</div>';

        // Body.
        html += '<div class="bp-body">';

        if (state.view === 'form') {
            html += renderForm();
        } else if (state.view === 'success') {
            html += renderSuccess();
        } else {
            html += renderError();
        }

        html += '</div>';

        panel.innerHTML = html;
        bindEvents(panel);
    }

    /* -- Form View --------------------------------------------- */

    function renderForm() {
        var html = '';

        // Context bar — current page.
        html += '<div class="bp-context">';
        html += '<span class="bp-context-icon">\uD83D\uDCC4</span>';
        html += '<span>' + escHtml(window.location.pathname) + '</span>';
        html += '</div>';

        // Comment textarea.
        html += '<div class="bp-field">';
        html += '<label for="bp-comment">' + escHtml(i18n.whatHappened || 'What happened?') + ' <span style="color:var(--bp-error);">*</span></label>';
        html += '<textarea id="bp-comment" placeholder="' + escAttr(i18n.describeIssue || 'Describe the issue...') + '">' + escHtml(state.comment) + '</textarea>';
        html += '</div>';

        // Reporter info (hidden when privacy disables it).
        if (C.enableReporterInfo) {
            html += '<div class="bp-field">';
            html += '<label for="bp-name">' + escHtml(i18n.yourName || 'Your Name') + ' <span style="color:var(--bp-text-light);font-weight:400;text-transform:none;">(' + escHtml(i18n.optional || 'optional') + ')</span></label>';
            html += '<input type="text" id="bp-name" value="' + escAttr(state.reporterName) + '" placeholder="' + escAttr('Jane Doe') + '">';
            html += '</div>';

            html += '<div class="bp-field">';
            html += '<label for="bp-email">' + escHtml(i18n.email || 'Email') + ' <span style="color:var(--bp-text-light);font-weight:400;text-transform:none;">(' + escHtml(i18n.optional || 'optional') + ')</span></label>';
            html += '<input type="email" id="bp-email" value="' + escAttr(state.reporterEmail) + '" placeholder="' + escAttr('jane@example.com') + '">';
            html += '</div>';
        }

        // File attachments.
        if (C.enableAttachments) {
            html += '<div class="bp-field" id="bp-attach-wrap">';
            html += '<label>' + escHtml(i18n.attachFiles || 'Attach files') + ' <span style="color:var(--bp-text-light);font-weight:400;text-transform:none;">(' + escHtml(i18n.optional || 'optional') + ')</span></label>';
            html += '<input type="file" id="bp-files" multiple accept="' + escAttr((C.allowedFileTypes || 'jpg,jpeg,png,gif,pdf').split(',').map(function(t){return '.'+t.trim();}).join(',')) + '" style="font-size:13px;">';
            html += '<div id="bp-file-list" style="margin-top:6px;font-size:12px;color:var(--bp-text-light);"></div>';
            html += '</div>';
        }

        // Honeypot (hidden from humans).
        html += '<div class="bp-hp"><label>Website<input type="text" id="bp-website" name="bugpost_website" tabindex="-1" autocomplete="off"></label></div>';

        // Submit.
        html += '<button class="bp-submit" type="button" id="bp-submit-btn">' + escHtml(i18n.submitReport || 'Submit Report') + '</button>';

        return html;
    }

    /* -- Success View ------------------------------------------ */

    function renderSuccess() {
        return '<div class="bp-message bp-message-success">' +
            '<div class="bp-message-icon">\u2714</div>' +
            '<h3>' + escHtml(i18n.submitted || 'Report Submitted!') + '</h3>' +
            '<p>' + escHtml(i18n.thankYou || 'Thank you for helping us improve.') + '</p>' +
            '<button class="bp-new-report-btn" id="bp-new-report">' + escHtml(i18n.submitAnother || 'Submit Another') + '</button>' +
            '</div>';
    }

    /* -- Error View -------------------------------------------- */

    function renderError() {
        return '<div class="bp-message bp-message-error">' +
            '<div class="bp-message-icon">\u2716</div>' +
            '<h3>' + escHtml(i18n.submitFailed || 'Submission Failed') + '</h3>' +
            '<p>' + escHtml(state.resultError || i18n.unknownError || 'An unknown error occurred.') + '</p>' +
            '<button class="bp-new-report-btn" id="bp-retry">' + escHtml(i18n.tryAgain || 'Try Again') + '</button>' +
            '</div>';
    }

    /* -- Event Binding ----------------------------------------- */

    function bindEvents(panel) {
        var closeBtn = panel.querySelector('.bp-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', closePanel);
        }

        if (state.view === 'form') {
            var submitBtn = panel.querySelector('#bp-submit-btn');
            if (submitBtn) {
                submitBtn.addEventListener('click', submitReport);
            }
        }

        if (state.view === 'success') {
            var newBtn = panel.querySelector('#bp-new-report');
            if (newBtn) {
                newBtn.addEventListener('click', openPanel);
            }
        }

        if (state.view === 'error') {
            var retryBtn = panel.querySelector('#bp-retry');
            if (retryBtn) {
                retryBtn.addEventListener('click', function () {
                    state.view = 'form';
                    state.resultError = null;
                    renderView();
                });
            }
        }
    }

    /* -- Form Submission --------------------------------------- */

    function submitReport() {
        var panel     = document.getElementById('bugpost-panel');
        var commentEl = panel.querySelector('#bp-comment');
        var nameEl    = panel.querySelector('#bp-name');
        var emailEl   = panel.querySelector('#bp-email');
        var hpEl      = panel.querySelector('#bp-website');

        state.comment = commentEl ? commentEl.value.trim() : '';
        if (nameEl)  { state.reporterName  = nameEl.value.trim(); }
        if (emailEl) { state.reporterEmail = emailEl.value.trim(); }

        // Validate: comment is required.
        if (!state.comment) {
            if (commentEl) {
                commentEl.style.borderColor = 'var(--bp-error)';
                commentEl.focus();
            }
            return;
        }

        var submitBtn = panel.querySelector('#bp-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="bp-spinner"></span>' + escHtml(i18n.submitting || 'Submitting...');
        }

        var fd = new FormData();
        fd.append('action',          'bugpost_submit');
        fd.append('nonce',           C.nonce);
        fd.append('comment',         state.comment);
        fd.append('page_url',        C.stripQueryStrings ? (window.location.origin + window.location.pathname) : window.location.href);
        fd.append('page_title',      document.title);
        fd.append('browser',         getBrowser());
        fd.append('os',              getOS());
        fd.append('screen_size',     window.innerWidth + 'x' + window.innerHeight);
        fd.append('reporter_name',   state.reporterName);
        fd.append('reporter_email',  state.reporterEmail);
        fd.append('console_errors',  state.consoleErrors.join('\n'));
        fd.append('load_time',       state.loadTime);
        fd.append('bugpost_website', hpEl ? hpEl.value : '');

        // File attachments.
        var fileInput = panel.querySelector('#bp-files');
        if (fileInput && fileInput.files.length > 0) {
            var max = C.maxAttachments || 3;
            for (var fi = 0; fi < Math.min(fileInput.files.length, max); fi++) {
                fd.append('bugpost_files[]', fileInput.files[fi]);
            }
        }

        $.ajax({
            url:  C.ajaxUrl,
            type: 'POST',
            data: fd,
            processData: false,
            contentType: false,
            success: function (resp) {
                if (resp.success) {
                    state.view = 'success';
                    state.resultError = null;
                } else {
                    state.view = 'error';
                    state.resultError = (resp.data && resp.data.message) ? resp.data.message : (i18n.unknownError || 'Unknown error occurred.');
                }
                renderView();
            },
            error: function (xhr) {
                var msg = i18n.networkError || 'Network error. Please check your connection.';
                try {
                    var d = JSON.parse(xhr.responseText);
                    if (d.data && d.data.message) { msg = d.data.message; }
                } catch (ignored) { /* parse failed */ }
                state.view = 'error';
                state.resultError = msg;
                renderView();
            }
        });
    }

    /* -- Helpers ------------------------------------------------ */

    function escHtml(str) {
        var d = document.createElement('div');
        d.textContent = str || '';
        return d.innerHTML;
    }

    function escAttr(str) {
        return (str || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /* -- Init -------------------------------------------------- */

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildWidget);
    } else {
        buildWidget();
    }

})();

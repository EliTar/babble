(function() {

  // nb. This is for IE10 and lower _only_.
  var supportCustomEvent = window.CustomEvent;
  if (!supportCustomEvent || typeof supportCustomEvent === 'object') {
    supportCustomEvent = function CustomEvent(event, x) {
      x = x || {};
      var ev = document.createEvent('CustomEvent');
      ev.initCustomEvent(event, !!x.bubbles, !!x.cancelable, x.detail || null);
      return ev;
    };
    supportCustomEvent.prototype = window.Event.prototype;
  }

  /**
   * @param {Element} el to check for stacking context
   * @return {boolean} whether this el or its parents creates a stacking context
   */
  function createsStackingContext(el) {
    while (el && el !== document.body) {
      var s = window.getComputedStyle(el);
      var invalid = function(k, ok) {
        return !(s[k] === undefined || s[k] === ok);
      }
      if (s.opacity < 1 ||
          invalid('zIndex', 'auto') ||
          invalid('transform', 'none') ||
          invalid('mixBlendMode', 'normal') ||
          invalid('filter', 'none') ||
          invalid('perspective', 'none') ||
          s['isolation'] === 'isolate' ||
          s.position === 'fixed' ||
          s.webkitOverflowScrolling === 'touch') {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  /**
   * Finds the nearest <dialog> from the passed element.
   *
   * @param {Element} el to search from
   * @return {HTMLDialogElement} dialog found
   */
  function findNearestDialog(el) {
    while (el) {
      if (el.localName === 'dialog') {
        return /** @type {HTMLDialogElement} */ (el);
      }
      el = el.parentElement;
    }
    return null;
  }

  /**
   * Blur the specified element, as long as it's not the HTML body element.
   * This works around an IE9/10 bug - blurring the body causes Windows to
   * blur the whole application.
   *
   * @param {Element} el to blur
   */
  function safeBlur(el) {
    if (el && el.blur && el !== document.body) {
      el.blur();
    }
  }

  /**
   * @param {!NodeList} nodeList to search
   * @param {Node} node to find
   * @return {boolean} whether node is inside nodeList
   */
  function inNodeList(nodeList, node) {
    for (var i = 0; i < nodeList.length; ++i) {
      if (nodeList[i] === node) {
        return true;
      }
    }
    return false;
  }

  /**
   * @param {HTMLFormElement} el to check
   * @return {boolean} whether this form has method="dialog"
   */
  function isFormMethodDialog(el) {
    if (!el || !el.hasAttribute('method')) {
      return false;
    }
    return el.getAttribute('method').toLowerCase() === 'dialog';
  }

  /**
   * @param {!HTMLDialogElement} dialog to upgrade
   * @constructor
   */
  function dialogPolyfillInfo(dialog) {
    this.dialog_ = dialog;
    this.replacedStyleTop_ = false;
    this.openAsModal_ = false;

    // Set a11y role. Browsers that support dialog implicitly know this already.
    if (!dialog.hasAttribute('role')) {
      dialog.setAttribute('role', 'dialog');
    }

    dialog.show = this.show.bind(this);
    dialog.showModal = this.showModal.bind(this);
    dialog.close = this.close.bind(this);

    if (!('returnValue' in dialog)) {
      dialog.returnValue = '';
    }

    if ('MutationObserver' in window) {
      var mo = new MutationObserver(this.maybeHideModal.bind(this));
      mo.observe(dialog, {attributes: true, attributeFilter: ['open']});
    } else {
      // IE10 and below support. Note that DOMNodeRemoved etc fire _before_ removal. They also
      // seem to fire even if the element was removed as part of a parent removal. Use the removed
      // events to force downgrade (useful if removed/immediately added).
      var removed = false;
      var cb = function() {
        removed ? this.downgradeModal() : this.maybeHideModal();
        removed = false;
      }.bind(this);
      var timeout;
      var delayModel = function(ev) {
        if (ev.target !== dialog) { return; }  // not for a child element
        var cand = 'DOMNodeRemoved';
        removed |= (ev.type.substr(0, cand.length) === cand);
        window.clearTimeout(timeout);
        timeout = window.setTimeout(cb, 0);
      };
      ['DOMAttrModified', 'DOMNodeRemoved', 'DOMNodeRemovedFromDocument'].forEach(function(name) {
        dialog.addEventListener(name, delayModel);
      });
    }
    // Note that the DOM is observed inside DialogManager while any dialog
    // is being displayed as a modal, to catch modal removal from the DOM.

    Object.defineProperty(dialog, 'open', {
      set: this.setOpen.bind(this),
      get: dialog.hasAttribute.bind(dialog, 'open')
    });

    this.backdrop_ = document.createElement('div');
    this.backdrop_.className = 'backdrop';
    this.backdrop_.addEventListener('click', this.backdropClick_.bind(this));
  }

  dialogPolyfillInfo.prototype = {

    get dialog() {
      return this.dialog_;
    },

    /**
     * Maybe remove this dialog from the modal top layer. This is called when
     * a modal dialog may no longer be tenable, e.g., when the dialog is no
     * longer open or is no longer part of the DOM.
     */
    maybeHideModal: function() {
      if (this.dialog_.hasAttribute('open') && document.body.contains(this.dialog_)) { return; }
      this.downgradeModal();
    },

    /**
     * Remove this dialog from the modal top layer, leaving it as a non-modal.
     */
    downgradeModal: function() {
      if (!this.openAsModal_) { return; }
      this.openAsModal_ = false;
      this.dialog_.style.zIndex = '';

      // This won't match the native <dialog> exactly because if the user set top on a centered
      // polyfill dialog, that top gets thrown away when the dialog is closed. Not sure it's
      // possible to polyfill this perfectly.
      if (this.replacedStyleTop_) {
        this.dialog_.style.top = '';
        this.replacedStyleTop_ = false;
      }

      // Clear the backdrop and remove from the manager.
      this.backdrop_.parentNode && this.backdrop_.parentNode.removeChild(this.backdrop_);
      dialogPolyfill.dm.removeDialog(this);
    },

    /**
     * @param {boolean} value whether to open or close this dialog
     */
    setOpen: function(value) {
      if (value) {
        this.dialog_.hasAttribute('open') || this.dialog_.setAttribute('open', '');
      } else {
        this.dialog_.removeAttribute('open');
        this.maybeHideModal();  // nb. redundant with MutationObserver
      }
    },

    /**
     * Handles clicks on the fake .backdrop element, redirecting them as if
     * they were on the dialog itself.
     *
     * @param {!Event} e to redirect
     */
    backdropClick_: function(e) {
      if (!this.dialog_.hasAttribute('tabindex')) {
        // Clicking on the backdrop should move the implicit cursor, even if dialog cannot be
        // focused. Create a fake thing to focus on. If the backdrop was _before_ the dialog, this
        // would not be needed - clicks would move the implicit cursor there.
        var fake = document.createElement('div');
        this.dialog_.insertBefore(fake, this.dialog_.firstChild);
        fake.tabIndex = -1;
        fake.focus();
        this.dialog_.removeChild(fake);
      } else {
        this.dialog_.focus();
      }

      var redirectedEvent = document.createEvent('MouseEvents');
      redirectedEvent.initMouseEvent(e.type, e.bubbles, e.cancelable, window,
          e.detail, e.screenX, e.screenY, e.clientX, e.clientY, e.ctrlKey,
          e.altKey, e.shiftKey, e.metaKey, e.button, e.relatedTarget);
      this.dialog_.dispatchEvent(redirectedEvent);
      e.stopPropagation();
    },

    /**
     * Focuses on the first focusable element within the dialog. This will always blur the current
     * focus, even if nothing within the dialog is found.
     */
    focus_: function() {
      // Find element with `autofocus` attribute, or fall back to the first form/tabindex control.
      var target = this.dialog_.querySelector('[autofocus]:not([disabled])');
      if (!target && this.dialog_.tabIndex >= 0) {
        target = this.dialog_;
      }
      if (!target) {
        // Note that this is 'any focusable area'. This list is probably not exhaustive, but the
        // alternative involves stepping through and trying to focus everything.
        var opts = ['button', 'input', 'keygen', 'select', 'textarea'];
        var query = opts.map(function(el) {
          return el + ':not([disabled])';
        });
        // TODO(samthor): tabindex values that are not numeric are not focusable.
        query.push('[tabindex]:not([disabled]):not([tabindex=""])');  // tabindex != "", not disabled
        target = this.dialog_.querySelector(query.join(', '));
      }
      safeBlur(document.activeElement);
      target && target.focus();
    },

    /**
     * Sets the zIndex for the backdrop and dialog.
     *
     * @param {number} dialogZ
     * @param {number} backdropZ
     */
    updateZIndex: function(dialogZ, backdropZ) {
      if (dialogZ < backdropZ) {
        throw new Error('dialogZ should never be < backdropZ');
      }
      this.dialog_.style.zIndex = dialogZ;
      this.backdrop_.style.zIndex = backdropZ;
    },

    /**
     * Shows the dialog. If the dialog is already open, this does nothing.
     */
    show: function() {
      if (!this.dialog_.open) {
        this.setOpen(true);
        this.focus_();
      }
    },

    /**
     * Show this dialog modally.
     */
    showModal: function() {
      if (this.dialog_.hasAttribute('open')) {
        throw new Error('Failed to execute \'showModal\' on dialog: The element is already open, and therefore cannot be opened modally.');
      }
      if (!document.body.contains(this.dialog_)) {
        throw new Error('Failed to execute \'showModal\' on dialog: The element is not in a Document.');
      }
      if (!dialogPolyfill.dm.pushDialog(this)) {
        throw new Error('Failed to execute \'showModal\' on dialog: There are too many open modal dialogs.');
      }

      if (createsStackingContext(this.dialog_.parentElement)) {
        console.warn('A dialog is being shown inside a stacking context. ' +
            'This may cause it to be unusable. For more information, see this link: ' +
            'https://github.com/GoogleChrome/dialog-polyfill/#stacking-context');
      }

      this.setOpen(true);
      this.openAsModal_ = true;

      // Optionally center vertically, relative to the current viewport.
      if (dialogPolyfill.needsCentering(this.dialog_)) {
        dialogPolyfill.reposition(this.dialog_);
        this.replacedStyleTop_ = true;
      } else {
        this.replacedStyleTop_ = false;
      }

      // Insert backdrop.
      this.dialog_.parentNode.insertBefore(this.backdrop_, this.dialog_.nextSibling);

      // Focus on whatever inside the dialog.
      this.focus_();
    },

    /**
     * Closes this HTMLDialogElement. This is optional vs clearing the open
     * attribute, however this fires a 'close' event.
     *
     * @param {string=} opt_returnValue to use as the returnValue
     */
    close: function(opt_returnValue) {
      if (!this.dialog_.hasAttribute('open')) {
        throw new Error('Failed to execute \'close\' on dialog: The element does not have an \'open\' attribute, and therefore cannot be closed.');
      }
      this.setOpen(false);

      // Leave returnValue untouched in case it was set directly on the element
      if (opt_returnValue !== undefined) {
        this.dialog_.returnValue = opt_returnValue;
      }

      // Triggering "close" event for any attached listeners on the <dialog>.
      var closeEvent = new supportCustomEvent('close', {
        bubbles: false,
        cancelable: false
      });
      this.dialog_.dispatchEvent(closeEvent);
    }

  };

  var dialogPolyfill = {};

  dialogPolyfill.reposition = function(element) {
    var scrollTop = document.body.scrollTop || document.documentElement.scrollTop;
    var topValue = scrollTop + (window.innerHeight - element.offsetHeight) / 2;
    element.style.top = Math.max(scrollTop, topValue) + 'px';
  };

  dialogPolyfill.isInlinePositionSetByStylesheet = function(element) {
    for (var i = 0; i < document.styleSheets.length; ++i) {
      var styleSheet = document.styleSheets[i];
      var cssRules = null;
      // Some browsers throw on cssRules.
      try {
        cssRules = styleSheet.cssRules;
      } catch (e) {}
      if (!cssRules) { continue; }
      for (var j = 0; j < cssRules.length; ++j) {
        var rule = cssRules[j];
        var selectedNodes = null;
        // Ignore errors on invalid selector texts.
        try {
          selectedNodes = document.querySelectorAll(rule.selectorText);
        } catch(e) {}
        if (!selectedNodes || !inNodeList(selectedNodes, element)) {
          continue;
        }
        var cssTop = rule.style.getPropertyValue('top');
        var cssBottom = rule.style.getPropertyValue('bottom');
        if ((cssTop && cssTop !== 'auto') || (cssBottom && cssBottom !== 'auto')) {
          return true;
        }
      }
    }
    return false;
  };

  dialogPolyfill.needsCentering = function(dialog) {
    var computedStyle = window.getComputedStyle(dialog);
    if (computedStyle.position !== 'absolute') {
      return false;
    }

    // We must determine whether the top/bottom specified value is non-auto.  In
    // WebKit/Blink, checking computedStyle.top == 'auto' is sufficient, but
    // Firefox returns the used value. So we do this crazy thing instead: check
    // the inline style and then go through CSS rules.
    if ((dialog.style.top !== 'auto' && dialog.style.top !== '') ||
        (dialog.style.bottom !== 'auto' && dialog.style.bottom !== '')) {
      return false;
    }
    return !dialogPolyfill.isInlinePositionSetByStylesheet(dialog);
  };

  /**
   * @param {!Element} element to force upgrade
   */
  dialogPolyfill.forceRegisterDialog = function(element) {
    if (window.HTMLDialogElement || element.showModal) {
      console.warn('This browser already supports <dialog>, the polyfill ' +
          'may not work correctly', element);
    }
    if (element.localName !== 'dialog') {
      throw new Error('Failed to register dialog: The element is not a dialog.');
    }
    new dialogPolyfillInfo(/** @type {!HTMLDialogElement} */ (element));
  };

  /**
   * @param {!Element} element to upgrade, if necessary
   */
  dialogPolyfill.registerDialog = function(element) {
    if (!element.showModal) {
      dialogPolyfill.forceRegisterDialog(element);
    }
  };

  /**
   * @constructor
   */
  dialogPolyfill.DialogManager = function() {
    /** @type {!Array<!dialogPolyfillInfo>} */
    this.pendingDialogStack = [];

    var checkDOM = this.checkDOM_.bind(this);

    // The overlay is used to simulate how a modal dialog blocks the document.
    // The blocking dialog is positioned on top of the overlay, and the rest of
    // the dialogs on the pending dialog stack are positioned below it. In the
    // actual implementation, the modal dialog stacking is controlled by the
    // top layer, where z-index has no effect.
    this.overlay = document.createElement('div');
    this.overlay.className = '_dialog_overlay';
    this.overlay.addEventListener('click', function(e) {
      this.forwardTab_ = undefined;
      e.stopPropagation();
      checkDOM([]);  // sanity-check DOM
    }.bind(this));

    this.handleKey_ = this.handleKey_.bind(this);
    this.handleFocus_ = this.handleFocus_.bind(this);

    this.zIndexLow_ = 100000;
    this.zIndexHigh_ = 100000 + 150;

    this.forwardTab_ = undefined;

    if ('MutationObserver' in window) {
      this.mo_ = new MutationObserver(function(records) {
        var removed = [];
        records.forEach(function(rec) {
          for (var i = 0, c; c = rec.removedNodes[i]; ++i) {
            if (!(c instanceof Element)) {
              continue;
            } else if (c.localName === 'dialog') {
              removed.push(c);
            }
            removed = removed.concat(c.querySelectorAll('dialog'));
          }
        });
        removed.length && checkDOM(removed);
      });
    }
  };

  /**
   * Called on the first modal dialog being shown. Adds the overlay and related
   * handlers.
   */
  dialogPolyfill.DialogManager.prototype.blockDocument = function() {
    document.documentElement.addEventListener('focus', this.handleFocus_, true);
    document.addEventListener('keydown', this.handleKey_);
    this.mo_ && this.mo_.observe(document, {childList: true, subtree: true});
  };

  /**
   * Called on the first modal dialog being removed, i.e., when no more modal
   * dialogs are visible.
   */
  dialogPolyfill.DialogManager.prototype.unblockDocument = function() {
    document.documentElement.removeEventListener('focus', this.handleFocus_, true);
    document.removeEventListener('keydown', this.handleKey_);
    this.mo_ && this.mo_.disconnect();
  };

  /**
   * Updates the stacking of all known dialogs.
   */
  dialogPolyfill.DialogManager.prototype.updateStacking = function() {
    var zIndex = this.zIndexHigh_;

    for (var i = 0, dpi; dpi = this.pendingDialogStack[i]; ++i) {
      dpi.updateZIndex(--zIndex, --zIndex);
      if (i === 0) {
        this.overlay.style.zIndex = --zIndex;
      }
    }

    // Make the overlay a sibling of the dialog itself.
    var last = this.pendingDialogStack[0];
    if (last) {
      var p = last.dialog.parentNode || document.body;
      p.appendChild(this.overlay);
    } else if (this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
  };

  /**
   * @param {Element} candidate to check if contained or is the top-most modal dialog
   * @return {boolean} whether candidate is contained in top dialog
   */
  dialogPolyfill.DialogManager.prototype.containedByTopDialog_ = function(candidate) {
    while (candidate = findNearestDialog(candidate)) {
      for (var i = 0, dpi; dpi = this.pendingDialogStack[i]; ++i) {
        if (dpi.dialog === candidate) {
          return i === 0;  // only valid if top-most
        }
      }
      candidate = candidate.parentElement;
    }
    return false;
  };

  dialogPolyfill.DialogManager.prototype.handleFocus_ = function(event) {
    if (this.containedByTopDialog_(event.target)) { return; }

    event.preventDefault();
    event.stopPropagation();
    safeBlur(/** @type {Element} */ (event.target));

    if (this.forwardTab_ === undefined) { return; }  // move focus only from a tab key

    var dpi = this.pendingDialogStack[0];
    var dialog = dpi.dialog;
    var position = dialog.compareDocumentPosition(event.target);
    if (position & Node.DOCUMENT_POSITION_PRECEDING) {
      if (this.forwardTab_) {  // forward
        dpi.focus_();
      } else {  // backwards
        document.documentElement.focus();
      }
    } else {
      // TODO: Focus after the dialog, is ignored.
    }

    return false;
  };

  dialogPolyfill.DialogManager.prototype.handleKey_ = function(event) {
    this.forwardTab_ = undefined;
    if (event.keyCode === 27) {
      event.preventDefault();
      event.stopPropagation();
      var cancelEvent = new supportCustomEvent('cancel', {
        bubbles: false,
        cancelable: true
      });
      var dpi = this.pendingDialogStack[0];
      if (dpi && dpi.dialog.dispatchEvent(cancelEvent)) {
        dpi.dialog.close();
      }
    } else if (event.keyCode === 9) {
      this.forwardTab_ = !event.shiftKey;
    }
  };

  /**
   * Finds and downgrades any known modal dialogs that are no longer displayed. Dialogs that are
   * removed and immediately readded don't stay modal, they become normal.
   *
   * @param {!Array<!HTMLDialogElement>} removed that have definitely been removed
   */
  dialogPolyfill.DialogManager.prototype.checkDOM_ = function(removed) {
    // This operates on a clone because it may cause it to change. Each change also calls
    // updateStacking, which only actually needs to happen once. But who removes many modal dialogs
    // at a time?!
    var clone = this.pendingDialogStack.slice();
    clone.forEach(function(dpi) {
      if (removed.indexOf(dpi.dialog) !== -1) {
        dpi.downgradeModal();
      } else {
        dpi.maybeHideModal();
      }
    });
  };

  /**
   * @param {!dialogPolyfillInfo} dpi
   * @return {boolean} whether the dialog was allowed
   */
  dialogPolyfill.DialogManager.prototype.pushDialog = function(dpi) {
    var allowed = (this.zIndexHigh_ - this.zIndexLow_) / 2 - 1;
    if (this.pendingDialogStack.length >= allowed) {
      return false;
    }
    if (this.pendingDialogStack.unshift(dpi) === 1) {
      this.blockDocument();
    }
    this.updateStacking();
    return true;
  };

  /**
   * @param {!dialogPolyfillInfo} dpi
   */
  dialogPolyfill.DialogManager.prototype.removeDialog = function(dpi) {
    var index = this.pendingDialogStack.indexOf(dpi);
    if (index === -1) { return; }

    this.pendingDialogStack.splice(index, 1);
    if (this.pendingDialogStack.length === 0) {
      this.unblockDocument();
    }
    this.updateStacking();
  };

  dialogPolyfill.dm = new dialogPolyfill.DialogManager();
  dialogPolyfill.formSubmitter = null;
  dialogPolyfill.useValue = null;

  /**
   * Installs global handlers, such as click listers and native method overrides. These are needed
   * even if a no dialog is registered, as they deal with <form method="dialog">.
   */
  if (window.HTMLDialogElement === undefined) {

    /**
     * If HTMLFormElement translates method="DIALOG" into 'get', then replace the descriptor with
     * one that returns the correct value.
     */
    var testForm = document.createElement('form');
    testForm.setAttribute('method', 'dialog');
    if (testForm.method !== 'dialog') {
      var methodDescriptor = Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, 'method');
      if (methodDescriptor) {
        // TODO: older iOS and older PhantomJS fail to return the descriptor here
        var realGet = methodDescriptor.get;
        methodDescriptor.get = function() {
          if (isFormMethodDialog(this)) {
            return 'dialog';
          }
          return realGet.call(this);
        };
        var realSet = methodDescriptor.set;
        methodDescriptor.set = function(v) {
          if (typeof v === 'string' && v.toLowerCase() === 'dialog') {
            return this.setAttribute('method', v);
          }
          return realSet.call(this, v);
        };
        Object.defineProperty(HTMLFormElement.prototype, 'method', methodDescriptor);
      }
    }

    /**
     * Global 'click' handler, to capture the <input type="submit"> or <button> element which has
     * submitted a <form method="dialog">. Needed as Safari and others don't report this inside
     * document.activeElement.
     */
    document.addEventListener('click', function(ev) {
      dialogPolyfill.formSubmitter = null;
      dialogPolyfill.useValue = null;
      if (ev.defaultPrevented) { return; }  // e.g. a submit which prevents default submission

      var target = /** @type {Element} */ (ev.target);
      if (!target || !isFormMethodDialog(target.form)) { return; }

      var valid = (target.type === 'submit' && ['button', 'input'].indexOf(target.localName) > -1);
      if (!valid) {
        if (!(target.localName === 'input' && target.type === 'image')) { return; }
        // this is a <input type="image">, which can submit forms
        dialogPolyfill.useValue = ev.offsetX + ',' + ev.offsetY;
      }

      var dialog = findNearestDialog(target);
      if (!dialog) { return; }

      dialogPolyfill.formSubmitter = target;
    }, false);

    /**
     * Replace the native HTMLFormElement.submit() method, as it won't fire the
     * submit event and give us a chance to respond.
     */
    var nativeFormSubmit = HTMLFormElement.prototype.submit;
    function replacementFormSubmit() {
      if (!isFormMethodDialog(this)) {
        return nativeFormSubmit.call(this);
      }
      var dialog = findNearestDialog(this);
      dialog && dialog.close();
    }
    HTMLFormElement.prototype.submit = replacementFormSubmit;

    /**
     * Global form 'dialog' method handler. Closes a dialog correctly on submit
     * and possibly sets its return value.
     */
    document.addEventListener('submit', function(ev) {
      var form = /** @type {HTMLFormElement} */ (ev.target);
      if (!isFormMethodDialog(form)) { return; }
      ev.preventDefault();

      var dialog = findNearestDialog(form);
      if (!dialog) { return; }

      // Forms can only be submitted via .submit() or a click (?), but anyway: sanity-check that
      // the submitter is correct before using its value as .returnValue.
      var s = dialogPolyfill.formSubmitter;
      if (s && s.form === form) {
        dialog.close(dialogPolyfill.useValue || s.value);
      } else {
        dialog.close();
      }
      dialogPolyfill.formSubmitter = null;
    }, true);
  }

  dialogPolyfill['forceRegisterDialog'] = dialogPolyfill.forceRegisterDialog;
  dialogPolyfill['registerDialog'] = dialogPolyfill.registerDialog;

  if (typeof define === 'function' && 'amd' in define) {
    // AMD support
    define(function() { return dialogPolyfill; });
  } else if (typeof module === 'object' && typeof module['exports'] === 'object') {
    // CommonJS support
    module['exports'] = dialogPolyfill;
  } else {
    // all others
    window['dialogPolyfill'] = dialogPolyfill;
  }
})();


window.Babble = (function() {
    var counter = 0;
    var currentUUID = 0;
    var matchIdAndTimestamp = [];
    var url = 'http://localhost:9000';

    console.log('hello from client');

    maintainLocalStorage();
    showDialogAndListen();
    messageToLocalstorageListener();
    userLogoutListener();
    sendMessageListener();
    textareaAutoGrow();
    resizeListener();

    function resizeListener() {
        var textarea = document.querySelector('textarea');

        if (textarea === null) {
            return false;
        }

        window.addEventListener("resize", function(evt) {
            // Handle autogrow
            var event = new Event('input', {
                'bubbles': true,
                'cancelable': true
            });

            textarea.dispatchEvent(event);
        }, false);
    }

    function textareaAutoGrow() {
        var textarea = document.querySelector('textarea');
        var mainPane = document.querySelector('main');
        var inputArea = document.querySelector('.UserInputArea');
        var messages = document.querySelector('.Messages');

        if (textarea && mainPane && inputArea && messages) {
            var originalPercent = pixelToPercentHeight(textarea.scrollHeight, mainPane);
            textarea.addEventListener('input', function(evt) {
                oldScroll = textarea.scrollTop;
                inputArea.style.cssText = 'height:' + originalPercent + '%';
                var percent = pixelToPercentHeight(textarea.scrollHeight, mainPane);
                if (percent < 17)
                    percent = 17;
                inputArea.style.cssText = 'height:' + percent + '%';
                var bottom = (Number(percent));
                var maxHeight = 100 - Number(percent) - 10;
                messages.style.cssText = 'bottom: ' + bottom + '%; max-height: ' + maxHeight + '%';
                if (textarea.scrollHeight > 300) {
                    percent = pixelToPercentHeight(300, mainPane);
                    inputArea.style.cssText = 'height:' + percent + '%';
                    textarea.style.cssText = 'overflow-y: auto';
                    textarea.scrollTop = oldScroll;
                    bottom = (Number(percent));
                    maxHeight = 100 - Number(percent) - 10;
                    messages.style.cssText = 'bottom:' + bottom + '%; max-height: ' + maxHeight + '%';
                }
            }, false);
        }
    }

    function pixelToPercentHeight(pixel, mainPane) {
        var screenHeight = mainPane.clientHeight;
        var Percent = Math.round((pixel / screenHeight) * 100);
        return Percent;
    }

    // Logic is as follows:

    // maintainLocalStorage():
    // Reset the local storage values.

    // showDialogAndListen():
    // The communication between the server and the client is implemented as long polling.
    // A modal dialog is shown to the user, asking him for name and email.
    // The browser listens until the form is submited,
    // than saves the deatils of the user in the local storage
    // and opens 2 pool requests to the server: stats and messages.

    // messageToLocalstorageListener():
    // Each time the client's message changes, it's updated in the local storage of the browser.

    // userLogoutListener():
    // Make sure the browser will send the server an appropriate message when 
    // the user closes the tab of the messages.

    // sendMessageListener():
    // Waiting for the user to click the send button,
    // invokes the sending of a message to the server (postMessage);

    function maintainLocalStorage() {
        var lastSession = localStorage.getItem('babble');
        var textarea = document.querySelector('textarea');

        var userInfo = { name: '', email: '' };
        var currentMessage = '';

        if (lastSession) {
            lastSession = JSON.parse(lastSession);
            userInfo.name = lastSession.userInfo.name;
            userInfo.email = lastSession.userInfo.email;
            currentMessage = lastSession.currentMessage;
            if (textarea)
                textarea.value = currentMessage;
        }

        babble = { "currentMessage": currentMessage, "userInfo": userInfo };
        localStorage.setItem('babble', JSON.stringify(babble));
    }


    function showDialogAndListen() {
        var dialog = document.querySelector('dialog');
        var modalForm = document.querySelector('dialog > form');

        if (dialog === null || modalForm === null) {
            return false;
        }

        dialogPolyfill.registerDialog(dialog);
        dialog.showModal();
        dialog.addEventListener('close', function(event) {
            if (dialog.returnValue == 'save') {
                var userInformation = new userInfo(modalForm.name.value, modalForm.email.value);
                register(userInformation);
            } else if (dialog.returnValue == 'exists') {
                var localUserInfo = JSON.parse(localStorage.getItem('babble')).userInfo;
                var userInformation = new userInfo(localUserInfo.name, localUserInfo.email);
                register(userInformation);
            } else {
                var userInformation = new userInfo('Anonymous', 'Anonymous');
                register(userInformation);
            }
            getStats(updateStats);
            getMessages(counter, proccessMessages);
        });

        var localInfo = JSON.parse(localStorage.getItem('babble'));
        if (localInfo.userInfo.email != '' && localInfo.userInfo.email != 'Anonymous') {
            dialog.returnValue = 'exists';
            dialog.close();
        }
    }

    function userInfo(name, email) {
        this.name = name;
        this.email = email;
    }

    function message(name, email, message, timestamp) {
        this.name = name;
        this.email = email;
        this.message = message;
        this.timestamp = timestamp;
    }

    function register(userInfo) {
        var babble = { "currentMessage": "", "userInfo": userInfo };
        localStorage.setItem('babble', JSON.stringify(babble));
    }

    function getStats(callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url + '/stats');
        xhr.addEventListener('load', function(e) {
            var responseText = e.target.responseText;
            if (responseText != "")
                callback(JSON.parse(responseText));
            else
                getStats(updateStats);
        });
        xhr.send();
    }

    function getMessages(counter, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url + '/messages?counter=' + counter);
        currentUUID = generateUUID();
        xhr.setRequestHeader('X-Request-ID', currentUUID);
        xhr.addEventListener('load', function(e) {
            var responseText = e.target.responseText;
            if (responseText != "")
                callback(JSON.parse(responseText), counter);
            else
                getMessages(counter, proccessMessages);
        });
        xhr.send();
    }

    // Took from this cool guy https://gist.github.com/jed/982883
    function generateUUID(a) {
        return a ? (a ^ Math.random() * 16 >> a / 4).toString(16) : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, generateUUID);
    }

    function proccessMessages(messages, counter) {
        messages.forEach(function(message) {
            if (message != "")
                addMessageToChat(message);
        });

        counter += messages.length;
        getMessages(counter, proccessMessages);
    }

    function messageToLocalstorageListener() {
        // Update the local storage to current message
        var userText = document.querySelector('textarea');

        if (userText === null) {
            return false;
        }

        userText.addEventListener("input", function(evt) {
            var localState = JSON.parse(localStorage.babble);
            localState.currentMessage = userText.value;
            localStorage.setItem('babble', JSON.stringify(localState));
        }, false);
    }

    function userLogoutListener() {
        window.addEventListener('unload', function() {
            navigator.sendBeacon(url + '/logout', JSON.stringify(currentUUID));
        });
    }

    function sendMessageListener() {
        var form = document.querySelector('section > form');
        var textarea = document.querySelector('textarea');

        if (form === null || textarea === null) {
            return false;
        }

        // form.addEventListener('submit', function(e) {
        //     e.preventDefault();

        //     var parseLocalDate = JSON.parse(localStorage.babble);
        //     var userMessage = {
        //         "name": parseLocalDate.userInfo.name,
        //         "email": parseLocalDate.userInfo.email,
        //         "message": parseLocalDate.currentMessage,
        //         "timestamp": Date.now()
        //     };

        //     postMessage(userMessage, trackUserMessages);
        //     textarea.value = "";
        // });

        textarea.addEventListener('keydown', function(e) {
            if (e.keyCode == 13 && !e.shiftKey)
                formSubmit(e, textarea);
        });

        form.addEventListener('submit', function(e) {
            formSubmit(e, textarea);
        });
    }

    function formSubmit(e, textarea) {
        e.preventDefault();

        if (textarea.value == "") {
            alert("You can't send an empty message");
            return;
        }

        var parseLocalDate = JSON.parse(localStorage.babble);
        var userMessage = {
            "name": parseLocalDate.userInfo.name,
            "email": parseLocalDate.userInfo.email,
            "message": parseLocalDate.currentMessage,
            "timestamp": Date.now()
        };

        postMessage(userMessage, trackUserMessages);
        textarea.value = "";

        // Handle autogrow
        var event = new Event('input', {
            'bubbles': true,
            'cancelable': true
        });

        textarea.dispatchEvent(event);
    }

    function postMessage(message, callback) {
        // var form = document.querySelector('section > form');
        var xhr = new XMLHttpRequest();
        xhr.open('POST', url + '/messages');
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        // if (form.method === 'post') {
        //     xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        // }
        xhr.addEventListener('load', function(e) {
            callback(JSON.parse(e.target.responseText), message.timestamp);
        });
        // console.log(form.action + " and method is " + form.method);
        console.log(message);
        xhr.send(JSON.stringify(message));
    }

    function trackUserMessages(serverResponse, timestamp) {
        var messageIdAndTimestemp = { "id": serverResponse.id, "timestamp": timestamp };
        matchIdAndTimestamp.push(messageIdAndTimestemp);
    }

    function invokeDeleteMessage(element) {
        var messageToDelete = element.closest('li');
        timestampOfIdToDelete = messageToDelete.getAttribute('id');
        matching = matchIdAndTimestamp.filter(function(message) { return message.timestamp == timestampOfIdToDelete; });
        if (matching.length != 0) {
            idToDelete = matching[0].id;
            deleteMessage(idToDelete, deleteMessageByID);
        } else {
            alert("You can only delete your messages from the current session");
        }
    }

    function deleteMessage(id, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('DELETE', url + '/messages/' + id, true);
        // xhr.setRequestHeader('X-Request-ID', 'value');
        xhr.addEventListener('load', function(e) {
            callback(JSON.parse(e.target.responseText), id);
        });
        xhr.send();
    }

    // All the logic related to dealing with the client's HTML content.
    // Summery:
    // - Updating the user stats
    // - Deleting a message
    // - Class names for the created messages
    // - Logic of adding a message: addMessageToChat(message) and all that follows.

    function updateStats(stats) {
        var mesCounterObject = document.querySelector('dd:first-of-type');
        var userCounterObject = document.querySelector('dd:last-of-type');

        mesCounterObject.innerText = stats.messages;
        userCounterObject.innerText = stats.users;

        getStats(updateStats);
    }

    function deleteMessageByID(confirmation, id) {
        if (confirmation === true) {
            matching = matchIdAndTimestamp.filter(function(message) { return message.id === id; });
            timestampToDelete = matching[0].timestamp;
            toDelete = document.getElementById(timestampToDelete);
            toDelete.remove();
        }
    }

    const classNames = {
        messages: 'Messages',
        messageImg: 'Message-image',
        messageText: 'Message-text',
        messageBox: 'Message-box',
        messageX: 'Message-close',
        messageName: 'Message-name',
        messageTime: 'Message-time',
        inputArea: 'UserInputArea'
    };

    function addMessageToChat(message) {
        var messages = document.querySelector('.' + classNames.messages);

        var holeMessage = document.createElement("li");
        holeMessage.setAttribute('id', message.timestamp);

        profileURL = 'https://www.gravatar.com/avatar/' + message.emailHash + '.jpg?d=identicon';

        if (message.name == "Anonymous")
            profileURL = 'images/anon.png';

        profileImage = createMessageProfilePic(encodeURI(profileURL));
        messageBox = createMessageBox(message.message, message.name, message.timestamp, message.email);

        holeMessage.appendChild(profileImage);
        holeMessage.appendChild(messageBox);

        messages.appendChild(holeMessage);
        messages.scrollTop = messages.scrollHeight;

        // TODO: Had problems with timing. Rethink

        // profileImage.addEventListener("load", function() {
        //     messages.appendChild(holeMessage);
        //     messages.scrollTop = messages.scrollHeight;
        // });
    }

    function createMessageProfilePic(imgPath) {
        var profileImage = new Image();
        profileImage.src = imgPath;
        profileImage.className = classNames.messageImg;
        profileImage.alt = '';

        return profileImage;
    }

    function createMessageBox(userText, userName, userMessageTime, userEmail) {
        var messageBox = document.createElement('section');
        messageBox.setAttribute('class', classNames.messageBox);
        messageBox.setAttribute('tabindex', 1);

        if (userEmail === JSON.parse(localStorage.babble).userInfo.email) {
            var button = createExitButton();
            messageBox.appendChild(button);
        }

        var name = createMessageName(userName);
        var time = createMessageTime(userMessageTime);
        var paragraph = createMessageContent(userText);

        messageBox.appendChild(name);
        messageBox.appendChild(time);
        messageBox.appendChild(paragraph);

        return messageBox;
    }

    function createExitButton() {
        var button = document.createElement('button');
        var buttonText = document.createTextNode('x');
        button.setAttribute('class', classNames.messageX);
        button.setAttribute('aria-label', "Delete Message");
        button.setAttribute('tabindex', 1);
        button.setAttribute('onclick', 'Babble.invokeDeleteMessage(this)');
        button.appendChild(buttonText);

        return button;
    }

    function createMessageName(userName) {
        var name = document.createElement('cite');
        var nameText = document.createTextNode(userName);
        name.setAttribute('class', classNames.messageName);
        name.appendChild(nameText);

        return name;
    }

    function createMessageTime(currentTime) {
        var time = document.createElement('time');
        var timeText = document.createTextNode(parseTime(currentTime));
        // time.setAttribute('datetime', '08:00+03:00');
        time.setAttribute('datetime', new Date(currentTime).toISOString());
        time.setAttribute('class', classNames.messageTime);
        time.appendChild(timeText);

        return time;
    }

    function parseTime(time) {
        var userTime = new Date(time);
        var h = makeTimePretty(userTime.getHours());
        var m = makeTimePretty(userTime.getMinutes());

        return h + ':' + m;
    }

    function makeTimePretty(time) {
        if (time >= 0 && time <= 9) {
            time = '0' + time;
        }
        return time;
    }

    function createMessageContent(userContent) {
        var paragraph = document.createElement('p');
        var userText = document.createTextNode(userContent);
        paragraph.setAttribute('class', classNames.messageText);
        paragraph.appendChild(userText);

        return paragraph;
    }

    return {
        register: register,
        getMessages: getMessages,
        postMessage: postMessage,
        deleteMessage: deleteMessage,
        getStats: getStats,
        invokeDeleteMessage: invokeDeleteMessage
    };
})();

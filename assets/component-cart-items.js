import { Component } from '@theme/component';
import { fetchConfig, debounce, onAnimationEnd, prefersReducedMotion, resetShimmer } from '@theme/utilities';
import { morphSection, sectionRenderer } from '@theme/section-renderer';
import {
  ThemeEvents,
  CartUpdateEvent,
  QuantitySelectorUpdateEvent,
  CartAddEvent,
  DiscountUpdateEvent,
} from '@theme/events';
import { cartPerformance } from '@theme/performance';

/** @typedef {import('./utilities').TextComponent} TextComponent */

/**
 * A custom element that displays a cart items component.
 *
 * @typedef {object} Refs
 * @property {HTMLElement[]} quantitySelectors - The quantity selector elements.
 * @property {HTMLTableRowElement[]} cartItemRows - The cart item rows.
 * @property {TextComponent} cartTotal - The cart total.
 *
 * @extends {Component<Refs>}
 */
class CartItemsComponent extends Component {
  #debouncedOnChange = debounce(this.#onQuantityChange, 300).bind(this);

  connectedCallback() {
    super.connectedCallback();

    document.addEventListener(ThemeEvents.cartUpdate, this.#handleCartUpdate);
    document.addEventListener(ThemeEvents.discountUpdate, this.handleDiscountUpdate);
    document.addEventListener(ThemeEvents.quantitySelectorUpdate, this.#debouncedOnChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    document.removeEventListener(ThemeEvents.cartUpdate, this.#handleCartUpdate);
    document.removeEventListener(ThemeEvents.quantitySelectorUpdate, this.#debouncedOnChange);
  }

  /**
   * Handles QuantitySelectorUpdateEvent change event.
   * @param {QuantitySelectorUpdateEvent} event - The event.
   */
  #onQuantityChange(event) {
    const { quantity, cartLine: line } = event.detail;

    if (!line) return;

    if (quantity === 0) {
      return this.onLineItemRemove(line);
    }

    this.updateQuantity({
      line,
      quantity,
      action: 'change',
    });
    const lineItemRow = this.refs.cartItemRows[line - 1];

    if (!lineItemRow) return;

    const textComponent = /** @type {TextComponent | undefined} */ (lineItemRow.querySelector('text-component'));
    textComponent?.shimmer();
  }

  /**
   * Handles the line item removal.
   * @param {number} line - The line item index.
   */
  onLineItemRemove(line) {
    this.updateQuantity({
      line,
      quantity: 0,
      action: 'clear',
    });

    const cartItemRowToRemove = this.refs.cartItemRows[line - 1];

    if (!cartItemRowToRemove) return;

    const rowsToRemove = [
      cartItemRowToRemove,
      // Get all nested lines of the row to remove
      ...this.refs.cartItemRows.filter((row) => row.dataset.parentKey === cartItemRowToRemove.dataset.key),
    ];

    // Add class to the row to trigger the animation
    rowsToRemove.forEach((row) => {
      const remove = () => row.remove();

      if (prefersReducedMotion()) return remove();

      row.style.setProperty('--row-height', `${row.clientHeight}px`);
      row.classList.add('removing');

      // Remove the row after the animation ends
      onAnimationEnd(row, remove);
    });
  }

  /**
   * Updates the quantity.
   * @param {Object} config - The config.
   * @param {number} config.line - The line.
   * @param {number} config.quantity - The quantity.
   * @param {string} config.action - The action.
   */
  updateQuantity(config) {
    const cartPerformaceUpdateMarker = cartPerformance.createStartingMarker(`${config.action}:user-action`);

    this.#disableCartItems();

    const { line, quantity } = config;
    const { cartTotal } = this.refs;

    const cartItemsComponents = document.querySelectorAll('cart-items-component');
    const sectionsToUpdate = new Set([this.sectionId]);
    cartItemsComponents.forEach((item) => {
      if (item instanceof HTMLElement && item.dataset.sectionId) {
        sectionsToUpdate.add(item.dataset.sectionId);
      }
    });

    const body = JSON.stringify({
      line: line,
      quantity: quantity,
      sections: Array.from(sectionsToUpdate).join(','),
      sections_url: window.location.pathname,
    });

    cartTotal?.shimmer();

    fetch(`${Theme.routes.cart_change_url}`, fetchConfig('json', { body }))
      .then((response) => {
        return response.text();
      })
      .then((responseText) => {
        const parsedResponseText = JSON.parse(responseText);

        resetShimmer(this);

        if (parsedResponseText.errors) {
          this.#handleCartError(line, parsedResponseText);
          return;
        }

        const newSectionHTML = new DOMParser().parseFromString(
          parsedResponseText.sections[this.sectionId],
          'text/html'
        );

        // Grab the new cart item count from a hidden element
        const newCartHiddenItemCount = newSectionHTML.querySelector('[ref="cartItemCount"]')?.textContent;
        const newCartItemCount = newCartHiddenItemCount ? parseInt(newCartHiddenItemCount, 10) : 0;

        // Update data-cart-quantity for all matching variants
        this.#updateQuantitySelectors(parsedResponseText);

        this.dispatchEvent(
          new CartUpdateEvent({}, this.sectionId, {
            itemCount: newCartItemCount,
            source: 'cart-items-component',
            sections: parsedResponseText.sections,
          })
        );

        morphSection(this.sectionId, parsedResponseText.sections[this.sectionId]);

        this.#updateCartQuantitySelectorButtonStates();
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        this.#enableCartItems();
        cartPerformance.measureFromMarker(cartPerformaceUpdateMarker);
      });
  }

  /**
   * Handles the discount update.
   * @param {DiscountUpdateEvent} event - The event.
   */
  handleDiscountUpdate = (event) => {
    this.#handleCartUpdate(event);
  };

  /**
   * Handles the cart error.
   * @param {number} line - The line.
   * @param {Object} parsedResponseText - The parsed response text.
   * @param {string} parsedResponseText.errors - The errors.
   */
  #handleCartError = (line, parsedResponseText) => {
    const quantitySelector = this.refs.quantitySelectors[line - 1];
    const quantityInput = quantitySelector?.querySelector('input');

    if (!quantityInput) throw new Error('Quantity input not found');

    quantityInput.value = quantityInput.defaultValue;

    const cartItemError = this.refs[`cartItemError-${line}`];
    const cartItemErrorContainer = this.refs[`cartItemErrorContainer-${line}`];

    if (!(cartItemError instanceof HTMLElement)) throw new Error('Cart item error not found');
    if (!(cartItemErrorContainer instanceof HTMLElement)) throw new Error('Cart item error container not found');

    cartItemError.textContent = parsedResponseText.errors;
    cartItemErrorContainer.classList.remove('hidden');
  };

  /**
   * Handles the cart update.
   *
   * @param {DiscountUpdateEvent | CartUpdateEvent | CartAddEvent} event
   */
  #handleCartUpdate = (event) => {
    if (event instanceof DiscountUpdateEvent) {
      sectionRenderer.renderSection(this.sectionId, { cache: false });
      return;
    }
    if (event.target === this) return;

    const cartItemsHtml = event.detail.data.sections?.[this.sectionId];
    if (cartItemsHtml) {
      morphSection(this.sectionId, cartItemsHtml);

      // Update button states for all cart quantity selectors after morph
      this.#updateCartQuantitySelectorButtonStates();
    } else {
      sectionRenderer.renderSection(this.sectionId, { cache: false });
    }
  };

  /**
   * Disables the cart items.
   */
  #disableCartItems() {
    this.classList.add('cart-items-disabled');
  }

  /**
   * Enables the cart items.
   */
  #enableCartItems() {
    this.classList.remove('cart-items-disabled');
  }

  /**
   * Updates quantity selectors for all matching variants in the cart.
   * @param {Object} updatedCart - The updated cart object.
   * @param {Array<{variant_id: number, quantity: number}>} [updatedCart.items] - The cart items.
   */
  #updateQuantitySelectors(updatedCart) {
    if (!updatedCart.items) return;

    for (const item of updatedCart.items) {
      const variantId = item.variant_id.toString();
      const selectors = document.querySelectorAll(
        `quantity-selector-component[data-variant-id="${variantId}"], cart-quantity-selector-component[data-variant-id="${variantId}"]`
      );

      for (const selector of selectors) {
        const input = selector.querySelector('input[data-cart-quantity]');
        if (!input) continue;

        input.setAttribute('data-cart-quantity', item.quantity.toString());

        // Update the quantity selector's internal state
        if ('updateCartQuantity' in selector && typeof selector.updateCartQuantity === 'function') {
          selector.updateCartQuantity();
        }
      }
    }
  }

  /**
   * Updates button states for all cart quantity selector components.
   */
  #updateCartQuantitySelectorButtonStates() {
    const cartQuantitySelectors = document.querySelectorAll('cart-quantity-selector-component');
    for (const selector of cartQuantitySelectors) {
      if ('updateButtonStates' in selector && typeof selector.updateButtonStates === 'function') {
        selector.updateButtonStates();
      }
    }
  }

  /**
   * Gets the section id.
   * @returns {string} The section id.
   */
  get sectionId() {
    const { sectionId } = this.dataset;

    if (!sectionId) throw new Error('Section id missing');

    return sectionId;
  }
}

if (!customElements.get('cart-items-component')) {
  customElements.define('cart-items-component', CartItemsComponent);
}




// ========================================
// GIFT ADD-ONS FUNCTIONALITY - 3 POPUPS
// ========================================

function initGiftAddons() {
  // Get all modals
  const giftBagModal = document.getElementById('gift-bag-modal');
  const ribbonModal = document.getElementById('ribbon-modal');
  const giftCardModal = document.getElementById('gift-card-modal');
  
  let currentGiftBagId = null;
  
  // Helper function to open modal
  function openModal(modal) {
    if (!modal) return;
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
  }
  
  // Helper function to close modal
  function closeModal(modal) {
    if (!modal) return;
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
  
  // BUTTON CLICK HANDLERS
  document.body.addEventListener('click', function(e) {
    // GIFT BAG BUTTON CLICK
    if (e.target.closest('.gift-bag-trigger')) {
      e.preventDefault();
      const trigger = e.target.closest('.gift-bag-trigger');
      currentGiftBagId = trigger.getAttribute('data-gift-bag-id');
      const giftBagTitle = trigger.getAttribute('data-gift-bag-title');
      const giftBagPrice = trigger.getAttribute('data-gift-bag-price');
      
      if (giftBagModal) {
        const cleanPrice = giftBagPrice.replace(/<[^>]*>/g, '');
        const priceDisplay = giftBagModal.querySelector('.gift-bag-price');
        if (priceDisplay) {
          priceDisplay.textContent = giftBagTitle + ' - ' + cleanPrice;
        }
        openModal(giftBagModal);
      }
    }
    
    // RIBBON BUTTON CLICK
    if (e.target.closest('.ribbon-trigger')) {
      e.preventDefault();
      openModal(ribbonModal);
    }
    
    // GIFT CARD BUTTON CLICK
    if (e.target.closest('.gift-card-trigger')) {
      e.preventDefault();
      openModal(giftCardModal);
    }
  });
  
  // CLOSE BUTTONS (X and Cancel/No Thanks)
  document.querySelectorAll('.gift-addon-modal-close, .gift-addon-btn-no').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      closeModal(giftBagModal);
      closeModal(ribbonModal);
      closeModal(giftCardModal);
    });
  });
  
  // CLOSE ON OVERLAY CLICK
  document.querySelectorAll('.gift-addon-modal-overlay').forEach(function(overlay) {
    overlay.addEventListener('click', function() {
      closeModal(giftBagModal);
      closeModal(ribbonModal);
      closeModal(giftCardModal);
    });
  });
  
  // GIFT BAG - "YES, ADD IT!" BUTTON
  const giftBagYesBtn = giftBagModal ? giftBagModal.querySelector('.gift-addon-btn-yes') : null;
  if (giftBagYesBtn) {
    giftBagYesBtn.addEventListener('click', function(e) {
      e.preventDefault();
      if (!currentGiftBagId) return;
      
      giftBagYesBtn.textContent = 'Adding...';
      giftBagYesBtn.disabled = true;
      
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/cart/add';
      
      const idInput = document.createElement('input');
      idInput.type = 'hidden';
      idInput.name = 'id';
      idInput.value = currentGiftBagId;
      
      const qtyInput = document.createElement('input');
      qtyInput.type = 'hidden';
      qtyInput.name = 'quantity';
      qtyInput.value = '1';
      
      form.appendChild(idInput);
      form.appendChild(qtyInput);
      document.body.appendChild(form);
      form.submit();
    });
  }
  
  // RIBBON - "ADD TO CART" BUTTON
  const ribbonAddBtn = ribbonModal ? ribbonModal.querySelector('.ribbon-add-btn') : null;
  if (ribbonAddBtn) {
    ribbonAddBtn.addEventListener('click', function(e) {
      e.preventDefault();
      
      const selectedRibbon = ribbonModal.querySelector('input[name="ribbon-choice"]:checked');
      if (!selectedRibbon) {
        alert('Please select a ribbon option');
        return;
      }
      
      const ribbonId = selectedRibbon.getAttribute('data-ribbon-id');
      
      ribbonAddBtn.textContent = 'Adding...';
      ribbonAddBtn.disabled = true;
      
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/cart/add';
      
      const idInput = document.createElement('input');
      idInput.type = 'hidden';
      idInput.name = 'id';
      idInput.value = ribbonId;
      
      const qtyInput = document.createElement('input');
      qtyInput.type = 'hidden';
      qtyInput.name = 'quantity';
      qtyInput.value = '1';
      
      form.appendChild(idInput);
      form.appendChild(qtyInput);
      document.body.appendChild(form);
      form.submit();
    });
  }
  
  // GIFT CARD - "ADD TO CART" BUTTON
  const giftCardAddBtn = giftCardModal ? giftCardModal.querySelector('.gift-card-add-btn') : null;
  if (giftCardAddBtn) {
    giftCardAddBtn.addEventListener('click', function(e) {
      e.preventDefault();
      
      const messageInput = document.getElementById('gift-card-message');
      const message = messageInput ? messageInput.value.trim() : '';
      
      if (!message) {
        alert('Please write a message for the gift card');
        return;
      }
      
      giftCardAddBtn.textContent = 'Adding...';
      giftCardAddBtn.disabled = true;
      
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/cart/add';
      
      const idInput = document.createElement('input');
      idInput.type = 'hidden';
      idInput.name = 'id';
      idInput.value = '44487495942283';
      
      const qtyInput = document.createElement('input');
      qtyInput.type = 'hidden';
      qtyInput.name = 'quantity';
      qtyInput.value = '1';
      
      const messageInput2 = document.createElement('input');
      messageInput2.type = 'hidden';
      messageInput2.name = 'properties[Gift Card Message]';
      messageInput2.value = message;
      
      form.appendChild(idInput);
      form.appendChild(qtyInput);
      form.appendChild(messageInput2);
      document.body.appendChild(form);
      form.submit();
    });
  }
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGiftAddons);
} else {
  initGiftAddons();
}

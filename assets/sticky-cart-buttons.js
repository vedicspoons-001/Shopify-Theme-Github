// Sticky cart buttons on scroll - Mobile only
(function() {
  'use strict';
  
  if (window.innerWidth > 749) return;
  
  function initStickyButtons() {
    const buttonContainer = document.querySelector('.product-form-buttons');
    
    if (!buttonContainer) {
      console.log('Button container not found');
      return;
    }
    
    console.log('Found button container');
    
    let hasScrolled = false;
    
    function handleScroll() {
      const scrollPos = window.pageYOffset || document.documentElement.scrollTop;
      const scrollThreshold = 100; // Show after scrolling 100px
      
      if (scrollPos > scrollThreshold && !hasScrolled) {
        document.body.classList.add('scrolled');
        hasScrolled = true;
        console.log('Buttons shown at bottom');
      } else if (scrollPos <= scrollThreshold && hasScrolled) {
        document.body.classList.remove('scrolled');
        hasScrolled = false;
        console.log('Buttons hidden');
      }
    }
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('scroll', handleScroll, { passive: true });
    
    // Initial check
    handleScroll();
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStickyButtons);
  } else {
    initStickyButtons();
  }
})();

(function() {
  'use strict';
  
  if (window.innerWidth > 749) return;
  
  function init() {
    // Find the media container - try multiple selectors
    const mediaElement = document.querySelector('media-gallery') || 
                        document.querySelector('.product__media-container') ||
                        document.querySelector('.product:not(.product-form) .grid__item:first-child');
    
    if (!mediaElement) {
      console.log('Media element not found');
      return;
    }
    
    console.log('Found media element:', mediaElement.className || mediaElement.tagName);
    
    let scrollTimeout;
    
    function handleScroll() {
      const scrollPos = window.pageYOffset || document.documentElement.scrollTop;
      
      clearTimeout(scrollTimeout);
      
      if (scrollPos > 100) {
        mediaElement.classList.add('shrink');
      } else {
        mediaElement.classList.remove('shrink');
      }
    }
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('scroll', handleScroll, { passive: true });
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

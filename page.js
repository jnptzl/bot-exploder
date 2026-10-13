// Bot Exploder - runs in the page's own JS world (manifest "world": "MAIN")
//
// Held videos refuse play() the way Chrome's autoplay policy does, so X's
// player sees "autoplay blocked" and keeps its own play/pause state right.
// Pausing the video after X started it instead leaves the player believing
// the opposite of what's on screen, and its pause button stops working.
// content.js marks held videos with data-be-held.

(function() {
  'use strict';

  const play = HTMLMediaElement.prototype.play;

  HTMLMediaElement.prototype.play = function() {
    if (this.hasAttribute('data-be-held')) {
      return Promise.reject(new DOMException('Held until clicked (Bot Exploder)', 'NotAllowedError'));
    }
    return play.apply(this, arguments);
  };
})();

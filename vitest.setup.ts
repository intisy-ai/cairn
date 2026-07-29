import "@testing-library/jest-dom/vitest";

// jsdom does not implement the Web Animations API that Svelte transitions use.
// Provide a no-op stub so components with transition: directives render in tests.
if (typeof Element !== "undefined" && typeof Element.prototype.animate !== "function") {
  Element.prototype.animate = function animate() {
    return {
      cancel() {},
      finish() {},
      onfinish: null,
      currentTime: 0,
      playState: "finished",
    } as unknown as Animation;
  };
}

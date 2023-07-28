importScripts(
  "https://storage.googleapis.com/workbox-cdn/releases/6.2.4/workbox-sw.js",
);

if (workbox) {
  console.log("Workbox is loaded.");

  // Precaching assets
  workbox.precaching.precacheAndRoute([
    { url: "/index.html" },
    { url: "/weather.css" },
    { url: "/weather.js" },
    { url: "assets/*" },
  ]);

  // Cache images
  workbox.routing.registerRoute(
    /\.(?:png|gif|jpg|jpeg|svg)$/,
    new workbox.strategies.CacheFirst(),
  );

  // Cache other resources
  workbox.routing.registerRoute(
    /\.(?:woff2|woff|ttf|eot)$/,
    new workbox.strategies.NetworkFirst(),
  );

  // Handle offline fallback for HTML files
  workbox.routing.registerRoute(
    ({ request }) => request.mode === "navigate",
    async () => {
      try {
        const cache = await caches.open(workbox.core.cacheNames.precache);
        const response = await cache.match("/index.html");
        return response || (await fetch("/index.html"));
      } catch (error) {
        return caches.match("/index.html");
      }
    },
  );
} else {
  console.error("Workbox failed to load.");
}

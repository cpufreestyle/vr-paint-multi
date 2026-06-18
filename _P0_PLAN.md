Current state of vr-paint-multi: the Go server serves a standalone landing page (HTML embedded in main.go) and redirects /multiplayer.html to /. The actual A-Painter frontend is in the sibling directory `vr-paint/`, and vr-paint-multi/multi.html already references assets from vr-paint (build.js, vendor/, css/, assets/). The multiplayer-client.js has callbacks, but nobody registers them to render strokes. 

Next steps to implement:
1. Refactor main.go to serve static files from vr-paint-multi/static/ and remove the embedded landing page.
2. Copy needed A-Painter assets from vr-paint into vr-paint-multi/static/ (or create a static file server that can fall back to vr-paint).
3. Move multi.html to static/multiplayer.html or static/index.html.
4. Add onStroke / onStrokeDelta / onUndo / onClear callbacks in the page to render remote strokes using the A-Painter brush API.
5. Verify the server builds and the page loads assets.

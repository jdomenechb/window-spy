const x11 = require('x11');

const CurrentTime = 0;
const GrabModeSync = 0;
const GrabModeAsync = 1;
const SyncPointer = 0;

var Exposure = x11.eventMask.Exposure;
var PointerMotion = x11.eventMask.PointerMotion;

// Init connection with X
x11.createClient(async function(err, display) {
    var X = display.client;
    var root = display.screen[0].root;

    var white = display.screen[0].white_pixel;

    X.require('composite', function(err, Composite) {
        X.require('damage', function(err, Damage) {
            X.require('render', function(err, Render) {
                // --- Select window
                console.log('Select a window with your mouse cursor...');

                // Grab the control of the pointer to allow user click the window that wants
                X.GrabPointer(root, false, x11.eventMask.ButtonPress | x11.eventMask.ButtonRelease, GrabModeSync, GrabModeAsync, 0, 0, CurrentTime);
                X.AllowEvents(SyncPointer, CurrentTime);

                // Set a timeout to exit the application in case no one clicks a window
                var timeoutId = setTimeout(function () {
                    X.UngrabPointer(CurrentTime);
                    process.exit();
                }, 5000);

                // Wait for a button press
                X.on('event', async function (ev) {
                    // We only want presses
                    if (ev.name !== 'ButtonPress' || ev.child === root) {
                        return;
                    }

                    // Avoid to execute the default timeout
                    clearTimeout(timeoutId);

                    var widSrc = ev.child;

                    console.log("You've chosen Window #" + widSrc);

                    // Let the user click again normally
                    X.UngrabPointer(CurrentTime);

                    // Allow compositing
                    Composite.RedirectSubwindows(root, Composite.Redirect.Automatic);

                    // Prepare damage for detecting changes in the source window
                    var damage = X.AllocID();
                    Damage.Create(damage, widSrc, Damage.ReportLevel.NonEmpty)

                    // Get info about the geometry of the source window
                    var geometrySource = await new Promise(function (resolve, reject) {
                        X.GetGeometry(widSrc, function(err, data) {
                            resolve(data);
                        });
                    });

                    // Calculate the depthFormat from the depth of the source
                    var format = 0;

                    switch (geometrySource.depth) {
                        case 32:
                            format = Render.rgba32;
                            break;
                        case 24:
                            format = Render.rgb24;
                            break;
                        default:
                            console.err("No depthFormat defined for depth " + geometrySource.depth);
                            process.exit();
                    }

                    // Create the render for the source
                    var renderIdSrc = X.AllocID();
                    Render.CreatePicture(renderIdSrc, widSrc, format, {subwindowMode: 1});

                    // Create the destination window
                    var widDest = X.AllocID();

                    var widthDest = 1920/4;
                    var heightDest = 1080/4;

                    X.CreateWindow(widDest, display.screen[0].root, 0, 0, widthDest, heightDest);
                    X.ChangeWindowAttributes(widDest, {
                        eventMask: Exposure|PointerMotion,
                        backgroundPixel: white
                    });
                    X.ChangeProperty(0, widDest, X.atoms.WM_NAME, X.atoms.STRING, 8, "Window Spy");
                    X.MapWindow(widDest);

                    // Create the render for the destination window
                    var ridDest = X.AllocID();
                    Render.CreatePicture(ridDest, widDest, Render.rgb24);

                    var scale = widthDest / geometrySource.width;
                    var tmp =  geometrySource.height * scale;

                    if (tmp > heightDest) {
                        scale = heightDest / geometrySource.height;
                    }

                    console.log(scale);

                    Render.SetPictureTransform(renderIdSrc, [1,0,0,0,1,0,0,0,scale]);
                    Render.SetPictureFilter(renderIdSrc, 'bilinear', []);

                    X.on('event', function(ev) {
                        Damage.Subtract(damage, 0, 0);
                        Render.Composite(3, renderIdSrc, 0, ridDest, 0, 0, 0, 0, 0, 0, 4000, 4000);
                    });
                });
            });
        });
    });
});


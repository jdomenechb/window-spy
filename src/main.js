const x11 = require('x11');

const CurrentTime = 0;
const GrabModeSync = 0;
const GrabModeAsync = 1;
const SyncPointer = 0;

const Exposure = x11.eventMask.Exposure;

function calculateScaleAndOffset(srcW, srcH, destW, destH)
{
    let toReturn = {xOffset: 0, yOffset: 0, scale: destW / srcW};

    toReturn.yOffset = parseInt((destH - (srcH * toReturn.scale)) / 2);

    if (srcH * toReturn.scale > destH) {
        toReturn.scale = destH / srcH;
        toReturn.xOffset = parseInt((destW - (srcW * toReturn.scale)) / 2);
        toReturn.yOffset = 0;
    }

    return toReturn;
}

// Init connection with X
x11.createClient(async function(err, display) {
    let X = display.client;
    let root = display.screen[0].root;

    let white = display.screen[0].white_pixel;

    X.require('composite', function(err, Composite) {
        X.require('damage', function(err, Damage) {
            X.require('render', function(err, Render) {
                X.require('shape', function(err, Shape) {
                    // --- Select window
                    console.log('Select a window with your mouse cursor...');
                    console.log('If none selected, the application will exit in 5 seconds.');

                    // Grab the control of the pointer to allow user click the window that wants
                    X.GrabPointer(root, false, x11.eventMask.ButtonPress | x11.eventMask.ButtonRelease, GrabModeSync, GrabModeAsync, 0, 0, CurrentTime);
                    X.AllowEvents(SyncPointer, CurrentTime);

                    // Set a timeout to exit the application in case no one clicks a window
                    let timeoutId = setTimeout(function () {
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

                        let widSrc = ev.child;

                        console.log("You've chosen Window #" + widSrc);

                        // Let the user click again normally
                        X.UngrabPointer(CurrentTime);

                        // Allow compositing
                        Composite.RedirectWindow(widSrc, Composite.Redirect.Automatic);

                        // Prepare damage and shape for detecting changes in the source window
                        let damage = X.AllocID();
                        Damage.Create(damage, widSrc, Damage.ReportLevel.NonEmpty);

                        Shape.SelectInput(widSrc, true);

                        // Get info about the geometry of the source window
                        let geometrySource = await new Promise(function (resolve, reject) {
                            X.GetGeometry(widSrc, function(err, data) {
                                resolve(data);
                            });
                        });

                        // Calculate the depthFormat from the depth of the source
                        let format = 0;

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
                        let renderIdSrc = X.AllocID();
                        Render.CreatePicture(renderIdSrc, widSrc, format, {subwindowMode: 1});

                        // Create the destination window
                        let widDest = X.AllocID();

                        let widthDest = 1920/4;
                        let heightDest = 1080/4;

                        X.CreateWindow(widDest, display.screen[0].root, 0, 0, widthDest, heightDest);
                        X.ChangeWindowAttributes(widDest, {
                            eventMask: Exposure,
                            backgroundPixel: white
                        });
                        X.ChangeProperty(0, widDest, X.atoms.WM_NAME, X.atoms.STRING, 8, "Window Spy");
                        X.MapWindow(widDest);

                        // Create the render for the destination window
                        let ridDest = X.AllocID();
                        Render.CreatePicture(ridDest, widDest, Render.rgb24);

                        // Calculate the scale and prepare the source render accordingly
                        let scaleAndOffset = calculateScaleAndOffset(geometrySource.width, geometrySource.height, widthDest, heightDest);

                        Render.SetPictureTransform(renderIdSrc, [1,0,0,0,1,0,0,0,scaleAndOffset.scale]);
                        Render.SetPictureFilter(renderIdSrc, 'bilinear', []);

                        // Create the white fill-in
                        let renderIdWhite = X.AllocID();
                        Render.CreateSolidFill(renderIdWhite, 255, 255, 255, 0);

                        let resized = false;

                        X.on('event', async function(ev) {
                            // Treat the case the window is resized
                            if (ev.type === 64) {
                                // Scale event
                                resized = true;
                            }

                            if (resized && ev.name === 'DamageNotify') {
                                console.log(ev);
                                scaleAndOffset = calculateScaleAndOffset(ev.area.w, ev.area.h, widthDest, heightDest)
                                Render.SetPictureTransform(renderIdSrc, [1,0,0,0,1,0,0,0,scaleAndOffset.scale]);
                            }

                            Damage.Subtract(damage, 0, 0);
                            Render.Composite(3, renderIdWhite, 0, ridDest, 0, 0, 0, 0, 0, 0, widthDest, heightDest);
                            Render.Composite(3, renderIdSrc, 0, ridDest, 0, 0, 0, 0, scaleAndOffset.xOffset, scaleAndOffset.yOffset, widthDest, heightDest);
                        });
                    });
                });
            });
        });
    });
});


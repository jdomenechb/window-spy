/**
 * Copyright (C) 2017 Jordi Domènech Bonilla
 */

const x11 = require('x11');

const CurrentTime = 0;
const GrabModeSync = 0;
const GrabModeAsync = 1;
const SyncPointer = 0;

const ButtonPress = x11.eventMask.ButtonPress;
const ButtonRelease = x11.eventMask.ButtonRelease;
const PointerMotion = x11.eventMask.PointerMotion;

const Exposure = x11.eventMask.Exposure;

/**
 * Given the size of the source window and the size of the destination window, calculates, the scale and the offset in
 * which the mirrored image must be put.
 * @param srcW
 * @param srcH
 * @param destW
 * @param destH
 * @returns {{xOffset: number, yOffset: number, scale: number}}
 */
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

/**
 * Get a visual of 32 bits that can handle RGBA.
 * @param display
 * @returns {*}
 */
function getRGBAVisual(display)
{
    let visual;
    let rgbaVisuals = Object.keys(display.screen[0].depths[32]);

    for (let v in rgbaVisuals) {
        let vid = rgbaVisuals[v];

        if (display.screen[0].depths[32][vid].class === 4) {
            visual = vid;

            break;
        }
    }

    if (visual === undefined) {
        console.log('No RGBA visual found');
        return;
    }

    return visual;
}

/**
 * Creates a window for selection the region that is wanted to show from the window, and handles everything related.
 * @param display
 * @returns {Promise.<*>}
 */
async function createSelectRegionWindow(display)
{
    let X = display.client;
    let root = display.screen[0].root;

    let visual = getRGBAVisual(display);

    let cmid = X.AllocID();
    X.CreateColormap(cmid, root, visual, 0);

    let markerWid = X.AllocID();
    X.CreateWindow(
        markerWid, root, 0, 0,
        display.screen[0].pixel_width,
        display.screen[0].pixel_height,
        0, 32, 1, visual,
        {
            eventMask: Exposure | ButtonPress | ButtonRelease | PointerMotion,
            backgroundPixel: colorInt(128, 128, 128, 128),
            overrideRedirect: true,
            colormap: cmid,
            borderPixel: 0
        }
    );

    X.MapWindow(markerWid);

    let subWid;
    let selectionStarted = false;

    let selectedArea = await new Promise(function (resolve, reject) {
        let selectedArea = {x: 0, y: 0, width: 0, height: 0};

        X.on('event', function (ev) {
            if (ev.name === 'ButtonPress' && !selectionStarted) {
                selectedArea.x = ev.x;
                selectedArea.y = ev.y;

                subWid = X.AllocID();

                X.CreateWindow(subWid, markerWid, ev.x, ev.y, 1, 1, 0, 32, 1, visual, {
                    overrideRedirect: true,
                    colormap: cmid,
                    borderPixel: 0,
                    backgroundPixel: 0
                });

                X.MapWindow(subWid);
                selectionStarted = true;
            }

            if (ev.name === 'MotionNotify' && selectionStarted) {
                let selWidth = ev.x - selectedArea.x;
                let selHeight = ev.y - selectedArea.y;

                if (selWidth < 1) {
                    selWidth = 1;
                }

                if (selHeight < 1) {
                    selHeight = 1;
                }

                X.ResizeWindow(subWid, selWidth, selHeight);
            }

            if (ev.name === 'ButtonRelease' && selectionStarted) {
                if (ev.x > selectedArea.x && ev.y > selectedArea.y) {
                    selectedArea.width = ev.x - selectedArea.x;
                    selectedArea.height = ev.y - selectedArea.y;

                    console.log("Selected area to display:");
                    console.log(selectedArea);

                    selectionStarted = false;

                    resolve(selectedArea);
                }
            }
        });
    });

    X.DestroyWindow(markerWid);

    return selectedArea;
}

/**
 * Given an ARGB color, calculates its representation in Int.
 * @param a
 * @param r
 * @param g
 * @param b
 * @returns {number}
 */
function colorInt (a,r,g,b) {
    var a1 = a / 255;
    var ra = Math.floor(a1*r);
    var ga = Math.floor(a1*g);
    var ba = Math.floor(a1*b);
    var d = 256;
    return a*d*d*d + ra*d*d + ga*d + ba;
}

// Init connection with X
x11.createClient(async function(err, display) {
    let X = display.client;
    let root = display.screen[0].root;

    let white = display.screen[0].white_pixel;

    X.require('composite', function(err, Composite) {
        X.require('damage', function(err, Damage) {
            X.require('render', function(err, Render) {
                X.require('shape', async function(err, Shape) {
                    // --- Select window
                    console.log('Select a window with your mouse cursor...');
                    console.log('If none selected, the application will exit in 5 seconds.');

                    // Grab the control of the pointer to allow user click the window that wants
                    X.GrabPointer(root, false, ButtonPress | ButtonRelease, GrabModeSync, GrabModeAsync, 0, 0, CurrentTime);
                    X.AllowEvents(SyncPointer, CurrentTime);

                    // Set a timeout to exit the application in case no one clicks a window
                    let timeoutId = setTimeout(function () {
                        X.UngrabPointer(CurrentTime);
                        process.exit();
                    }, 5000);

                    // Wait for a button press
                    let widSrc = await new Promise(function (resolve, reject) {
                        let pressCallback = async function (ev) {
                            // We only want presses
                            if (ev.name !== 'ButtonPress' || ev.child === root) {
                                return;
                            }

                            X.removeListener('event', pressCallback);

                            // Avoid to execute the default timeout
                            clearTimeout(timeoutId);

                            resolve(ev.child);
                        };

                        X.on('event', pressCallback);
                    });

                    console.log("You've chosen Window #" + widSrc);
                    console.log('');

                    // Let the user click again normally
                    X.UngrabPointer(CurrentTime);

                    // Get the selected area of the window to show
                    console.log('Select the area you want to mirror...');
                    let selectedArea = await createSelectRegionWindow(display);

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

                    let scaleAndOffset = calculateScaleAndOffset(
                        selectedArea.width,
                        selectedArea.height,
                        widthDest,
                        heightDest
                    );

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
                            let calWidth = Math.min(selectedArea.width, ev.area.w - selectedArea.x);
                            let calHeight = Math.min(selectedArea.height, ev.area.h - selectedArea.y);

                            scaleAndOffset = calculateScaleAndOffset(
                                calWidth,
                                calHeight,
                                widthDest,
                                heightDest
                            );

                            Render.SetPictureTransform(renderIdSrc, [1,0,0,0,1,0,0,0,scaleAndOffset.scale]);
                        }

                        Damage.Subtract(damage, 0, 0);

                        // Render white first and then the mirrored window over
                        Render.Composite(3, renderIdWhite, 0, ridDest, 0, 0, 0, 0, 0, 0, widthDest, heightDest);
                        Render.Composite(3, renderIdSrc, 0, ridDest, selectedArea.x * scaleAndOffset.scale, selectedArea.y * scaleAndOffset.scale, 0, 0, scaleAndOffset.xOffset, scaleAndOffset.yOffset, selectedArea.width * scaleAndOffset.scale, selectedArea.height * scaleAndOffset.scale);
                    });
                });
            });
        });
    });
});


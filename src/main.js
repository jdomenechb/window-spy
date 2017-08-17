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
const StructureNotify = x11.eventMask.StructureNotify;

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
    let toReturn = {
        xOffset: 0,
        yOffset: 0,
        scale: destW / srcW
    };

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
 * @param widGeometry
 * @returns {Promise.<*>}
 */
async function createSelectRegionWindow(display, widGeometry)
{
    let X = display.client;
    let root = display.screen[0].root;
    let white = display.screen[0].white_pixel;

    let visual = getRGBAVisual(display);

    let infoWindow = X.AllocID();
    let infoWindowW = 270;
    let infoWindowH = 30;

    X.CreateWindow(
        infoWindow, root,
        parseInt((display.screen[0].pixel_width - infoWindowW) / 2),
        parseInt((display.screen[0].pixel_height - infoWindowH) / 2),
        infoWindowW,
        infoWindowH);

    X.ChangeWindowAttributes(infoWindow, {
        eventMask: Exposure | StructureNotify,
        backgroundPixel: white,
        overrideRedirect: true,
        borderPixel: 0
    });

    X.MapWindow(infoWindow);

    let infoWindowGc = X.AllocID();
    X.CreateGC(infoWindowGc, infoWindow);

    X.PolyText8(infoWindow, infoWindowGc, 20, 20, ['Select the area you want to mirror...']);

    // Create a colormap based on the RGBA visual
    let cmid = X.AllocID();
    X.CreateColormap(cmid, root, visual, 0);

    // Create the window that will cover the selected window
    let markerWid = X.AllocID();
    X.CreateWindow(
        markerWid, root, widGeometry.xPos, widGeometry.yPos,
        widGeometry.width,
        widGeometry.height,
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

    // Allow the user to select an area
    let subWid;
    let selectionStarted = false;

    let selectedArea = await new Promise(function (resolve) {
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

    X.DestroyWindow(infoWindow);
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
    let a1 = a / 255;
    let ra = Math.floor(a1*r);
    let ga = Math.floor(a1*g);
    let ba = Math.floor(a1*b);
    let d = 256;
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

                    // Create an information window
                    var infoWindow = X.AllocID();
                    var infoWindowW = 400;
                    var infoWindowH = 40;

                    X.CreateWindow(
                        infoWindow, root,
                        parseInt((display.screen[0].pixel_width - infoWindowW) / 2),
                        parseInt((display.screen[0].pixel_height - infoWindowH) / 2),
                        infoWindowW,
                        infoWindowH);

                    X.ChangeWindowAttributes(infoWindow, {
                        eventMask: Exposure | StructureNotify,
                        backgroundPixel: white,
                        overrideRedirect: true,
                        borderPixel: 0
                    });

                    X.MapWindow(infoWindow);

                    var infoWindowGc = X.AllocID();
                    X.CreateGC(infoWindowGc, infoWindow);

                    X.PolyText8(infoWindow, infoWindowGc, 75, 15, ['Select a window with your mouse cursor...']);
                    X.PolyText8(infoWindow, infoWindowGc, 27, 30, ['If none selected, the application will exit in 5 seconds.']);

                    // Grab the control of the pointer to allow user click the window that wants
                    X.GrabPointer(root, false, ButtonPress | ButtonRelease, GrabModeSync, GrabModeAsync, 0, 0, CurrentTime);
                    X.AllowEvents(SyncPointer, CurrentTime);

                    // Set a timeout to exit the application in case no one clicks a window
                    let timeoutId = setTimeout(function () {
                        X.UngrabPointer(CurrentTime);
                        X.DestroyWindow(infoWindow);
                        process.exit();
                    }, 5000);

                    // Wait for a button press
                    let widSrc = await new Promise(function (resolve) {
                        let pressCallback = async function (ev) {
                            // We only want presses
                            if (ev.name !== 'ButtonPress' || ev.child === root || ev.child === infoWindow) {
                                return;
                            }

                            X.removeListener('event', pressCallback);

                            // Avoid to execute the default timeout
                            clearTimeout(timeoutId);

                            X.DestroyWindow(infoWindow);

                            resolve(ev.child);
                        };

                        X.on('event', pressCallback);
                    });

                    console.log("You've chosen Window #" + widSrc);
                    console.log('');

                    // Let the user click again normally
                    X.UngrabPointer(CurrentTime);

                    // Bring the window to the front
                    // TODO: Try to allow as most WM as possible
                    X.RaiseWindow(widSrc);

                    // Get info about the geometry of the source window
                    let geometrySource = await new Promise(function (resolve) {
                        X.GetGeometry(widSrc, function(err, data) {
                            resolve(data);
                        });
                    });

                    // Get the selected area of the window to show
                    let selectedArea = await createSelectRegionWindow(display, geometrySource);

                    // Allow compositing
                    Composite.RedirectWindow(widSrc, Composite.Redirect.Automatic);

                    // Prepare damage and shape for detecting changes in the source window
                    let damage = X.AllocID();
                    Damage.Create(damage, widSrc, Damage.ReportLevel.NonEmpty);

                    Shape.SelectInput(widSrc, true);

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

                    // Set the default size (a multiple of a 1080HD screen)
                    let widthDest = 1920/4;
                    let heightDest = 1080/4;

                    // Create the destination window
                    let widDest = X.AllocID();

                    X.CreateWindow(widDest, display.screen[0].root, 0, 0, widthDest, heightDest);
                    X.ChangeWindowAttributes(widDest, {
                        eventMask: Exposure | StructureNotify,
                        backgroundPixel: white
                    });
                    X.ChangeProperty(0, widDest, X.atoms.WM_NAME, X.atoms.STRING, 8, "Window Spy");
                    X.MapWindow(widDest);

                    // Create the render for the destination window
                    let ridDest = X.AllocID();
                    Render.CreatePicture(ridDest, widDest, Render.rgb24);

                    // Calculate the scale and offset for the inner window
                    let calWidth = selectedArea.width;
                    let calHeight = selectedArea.height;

                    let scaleAndOffset = calculateScaleAndOffset(
                        calWidth,
                        calHeight,
                        widthDest,
                        heightDest
                    );

                    Render.SetPictureTransform(renderIdSrc, [1,0,0,0,1,0,0,0,scaleAndOffset.scale]);
                    Render.SetPictureFilter(renderIdSrc, 'bilinear', []);

                    // Create the white fill-in
                    let renderIdWhite = X.AllocID();
                    Render.CreateSolidFill(renderIdWhite, 255, 255, 255, 0);

                    // Treat events on windows
                    let resized = false;

                    X.on('event', async function(ev) {
                        // If the target window gets resized, update the size and the scale
                        if (ev.name === 'ConfigureNotify' && ev.wid === widDest) {
                            widthDest = ev.width;
                            heightDest = ev.height;

                            scaleAndOffset = calculateScaleAndOffset(
                                calWidth,
                                calHeight,
                                widthDest,
                                heightDest
                            );

                            Render.SetPictureTransform(renderIdSrc, [1,0,0,0,1,0,0,0,scaleAndOffset.scale]);
                        }

                        // Treat the case the source window is resized
                        if (ev.type === 64) {
                            // Scale event
                            resized = true;
                        }

                        if (resized && ev.name === 'DamageNotify') {
                            // Update the scale and offset with the new geometry of the source window
                            // FIXME: This can be optimized by using the ShapeNotify event not implemented in node-x11
                            calWidth = Math.min(selectedArea.width, ev.area.w - selectedArea.x);
                            calHeight = Math.min(selectedArea.height, ev.area.h - selectedArea.y);

                            scaleAndOffset = calculateScaleAndOffset(
                                calWidth,
                                calHeight,
                                widthDest,
                                heightDest
                            );

                            Render.SetPictureTransform(renderIdSrc, [1,0,0,0,1,0,0,0,scaleAndOffset.scale]);
                        }

                        // Render white first and then the mirrored window over
                        Damage.Subtract(damage, 0, 0);

                        Render.Composite(3, renderIdWhite, 0, ridDest, 0, 0, 0, 0, 0, 0, widthDest, heightDest);
                        Render.Composite(3, renderIdSrc, 0, ridDest, selectedArea.x * scaleAndOffset.scale, selectedArea.y * scaleAndOffset.scale, 0, 0, scaleAndOffset.xOffset, scaleAndOffset.yOffset, selectedArea.width * scaleAndOffset.scale, selectedArea.height * scaleAndOffset.scale);
                    });
                });
            });
        });
    });
});


var x11 = require('x11');
var x11prop = require('x11-prop');

var Exposure = x11.eventMask.Exposure;
var PointerMotion = x11.eventMask.PointerMotion;

// Init connection with X
x11.createClient(function(err, display) {
    var X = display.client;
    var root = display.screen[0].root;

    // ----- Get the window list
    x11prop.get_property(X, root, "_NET_CLIENT_LIST", X.atoms.WINDOW, function (err, data) {
        if (err) {
             console.error(err);
             return;
        }

        var windowList = {};

        // We need to obtain all names fom windows
        var promises = data.map(function(window) {
            return new Promise(function(resolve, reject) {
                x11prop.get_property(X, window, X.atoms.WM_NAME, "UTF8_STRING", function (err, data) {
                    if (err) {
                        console.error(err);
                        reject();
                    }

                    var result = data.toString();

                    if (!result) {
                        // It might be that the name is not in UTF-8: obtain the compose name
                        x11prop.get_property(X, window, X.atoms.WM_NAME, "STRING", function (err, data) {
                            if (err) {
                                console.error(err);
                                reject();
                            }

                            result = data.toString();

                            if (result) {
                                windowList[window] = result;
                            }

                            resolve();
                        });
                    } else {
                        windowList[window] = result;
                        resolve();
                    }
                });
            });
        });

        Promise.all(promises).then(function () {
            console.log(windowList);

            X.require('composite', function(err, Composite) {
                X.require('damage', function(err, Damage) {
                    X.require('render', function(err, Render) {
                        // Obtain the ID of the window we want to monitor
                        // TODO: Make this dynamic
                        var wid = Object.keys(windowList)[2];
                        console.log(wid);

                        Composite.RedirectSubwindows(root, Composite.Redirect.Automatic);

                        var damage = X.AllocID();
                        Damage.Create(damage, wid, Damage.ReportLevel.NonEmpty);

                        var rid = X.AllocID();
                        Render.CreatePicture(rid, wid, Render.rgba32, {subwindowMode: 1});

                        var white = display.screen[0].white_pixel;
                        var newwin = X.AllocID();

                        X.CreateWindow(newwin, display.screen[0].root, 0, 0, 600, 600);
                        X.ChangeWindowAttributes(newwin, {
                            eventMask: Exposure|PointerMotion,
                            backgroundPixel: white
                        });
                        X.ChangeProperty(0, newwin, X.atoms.WM_NAME, X.atoms.STRING, 8, "Hello screen");
                        X.MapWindow(newwin);

                        var ridDest = X.AllocID();
                        Render.CreatePicture(ridDest, newwin, Render.rgb24);

                        var scale = 0.5;
                        Render.SetPictureTransform(rid, [1,0,0,0,1,0,0,0,scale]);
                        Render.SetPictureFilter(rid, 'bilinear', []);

                        X.on('event', function(ev) {
                            Damage.Subtract(damage, 0, 0);
                            Render.Composite(3, rid, 0, ridDest, 0, 0, 0, 0, 0, 0, 400, 400);
                        });
                    });
                });
            });

            X.on('error', function(err) { console.log(err); });
        });
    });
});


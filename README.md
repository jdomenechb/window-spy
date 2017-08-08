 # Window Spy

Window Spy is an application that allows you mirroring any other window opened in your Linux desktop to a separate 
window, which afterwards you can move, resize, pin on top or remove borders (depending on your window manager).
 
Some case uses of this application are:
- Watch a video in the corner on the screen while you work on something else in a maximized window.
- Have a small drawing model placed permanently on your screen while you are drawing it.
- Show two windows or a camera input at the same time while performing an screencast.
- Much more!

The application first asks you to select a window in your desktop. 
Once selected, it asks you to select the region of the window that you want to mirror. 
After selecting it, a new window will appear, mirroring the region selected previously.

**The following must be noted while working with this application:**
- The source window (a.k.a. the window the content is mirrored from) should not be minimized: if doing so, the window 
will stop being mirrored.
- [Composite](https://wiki.archlinux.org/index.php/xorg#Composite) must be in use by your Window Manager or X Server.

The application has been developed using [Node.js](https://nodejs.org/en/) and the [node-x11](https://github.com/sidorares/node-x11) library, and works under Linux systems running the X11 
server (tested with Ubuntu + X11 + KWin).

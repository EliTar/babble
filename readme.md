# Babble
### Written by Eli Tarnarutsky, 2017
A web-based one room responsive chat implementation, using the long polling technique.  
Server and client are implemented using Node.js, JavaScript, HTML and CSS.

## How to use
If you haven't done so yet, download and install Node.js from the [official site](https://nodejs.org/en).

Clone into the git repo and run ```npm install```.

To start the chat, run ```npm start```.  
The client will start on port 8080, and the server on port 9000.  
The chat will be available at ```http://localhost:8080/client```.

To test the chat, run ```npm test```.  
The tests will be run by Mocha (with Sinon and Chai).  
The tests will be available at ```http://localhost:8081/test/client```.

## Developing
Press ```Ctrl+Shift+B``` to start watching changes in the .scss file (sass compiling).

Run ```npm run deploy``` to upload the `/client` folder to the gh-pages branch of the project.  
If you do so, make sure to add the **dialog-polyfill.js** to the ```/scripts``` folder under gh-pages branch, and update ```index.html``` accordingly.


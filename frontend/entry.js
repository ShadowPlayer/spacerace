var io = require("io"); // Note socket.io is added globally in the html page
var d3 = require("d3/d3.min.js");
var PIXI = require("./pixi.min.js");

var renderer;
// create the root of the scene graph
var stage = new PIXI.Container();

// TODO replace with awesome ship...
function rectangle( x, y, width, height, backgroundColor, borderColor, borderWidth ) {
    var box = new PIXI.Graphics();
    box.beginFill(backgroundColor);
    box.lineStyle(borderWidth , borderColor);
    box.drawRect(0, 0, width - borderWidth, height - borderWidth);
    box.endFill();
    box.position.x = x + borderWidth/2;
    box.position.y = y + borderWidth/2;
    return box;
}

var ships3D;

// test
// var r = rectangle(200, 150, 10, 10, 0xFFFFFF, 0x000000, 1);
// create a 10x10 white rectangle with a 1px black border at position 200, 150
//stage.addChild(r);


require("./style.css");

var socket = io();
var requestID;
var gameState;
var lastUpdateTime;

var updates = 0;
var draws = 0;
var fpsqueue = [];

var playerDiv = d3.select("#leaderboard");

socket.on('Log', function (msg) {
    var rawPacket = JSON.parse(msg);
    //console.log(rawPacket);

    if (rawPacket.category === "lobby") {
        console.log("Lobby Status received");
        console.log(rawPacket);

        d3.selectAll("#lobby ul").remove();


        var lobby = d3.selectAll("#lobby")
            .append("ul")
            .selectAll("#lobby li")
            .data(rawPacket.data.players);

        lobby.enter()
            .append("li")
            .text(function (d, i) {
                return d;
            })


    }
    else {
        console.log("Got unknown category");
        console.log(rawPacket);
    }
});


socket.on('GameState', function (msg) {
    var rawPacket = JSON.parse(msg);
    //console.log(rawPacket);

    if (rawPacket.state === "running") {
        gameState = rawPacket.data;
        updates += 1;

        if (updates == 1) {
            setupGame()
        }
    }

    if (rawPacket.state === "finished") {
        console.log("Game Over");
    }
});

//socket.on('GameMap', function (msg) {
//    var data = JSON.parse(msg).data;
//    setupGame(data)
//}

var gameDiv = d3.select('#game')
    .attr("width", "100%")
    .attr("height", "500");



var ships;

var x, y;

var width, height;

function loadMap() {
    // TODO Deal with all the maps
    // => DataUrl if the map file is smaller that 1Mb
    var mapData = require("url?limit=1000000!../maps/bt-circle1.png");

    var mapImage = document.createElement('img');
    mapImage.addEventListener('load', function () {
        /*
         * Find out the real size/aspect ratio of the
         * image so we draw our ships correctly
         * */
        width = mapImage.width;
        height = mapImage.height;
        var aspectRatio = width / height;

        console.log("Loaded map image. Size = (%s, %s)", width, height);

        // Set the game's height to match the map's aspect ratio?
        // TODO we want to take width and height of the browser into account

        var actualWidth = parseInt(gameDiv.style("width"), 10);
        var actualHeight = actualWidth / aspectRatio;


        console.log("Game size = ", actualWidth, actualHeight);

        // Add an <image> to our game
        // TODO add map image back to pixi canvas thing
        //mapContainer.append("image")
        //    .attr("id", "GameMap")
        //    .attr("width", actualWidth)
        //    .attr("height", actualHeight)
        //    .attr("xlink:href", mapData);

        renderer = PIXI.autoDetectRenderer(actualWidth, actualHeight, {backgroundColor : 0x000000});
        document.getElementById("game").appendChild(renderer.view);


        PIXI.loader
            .add(mapData)
            .load(function(){
                console.log("Loaded map texture");
                // https://github.com/kittykatattack/learningPixi#loading

                // Probably don't want the map as a sprite...
                // But this is a rough first cut...

                var sprite = new PIXI.Sprite.fromImage(mapData);
                stage.addChild(sprite);
                renderer.render(stage)
            });


        // Assume positions are between 0 and 100 for now
        // (0,0) is at the bottom left
        x = d3.scale.linear().domain([0, 100]).range([0, actualWidth]);
        y = d3.scale.linear().domain([0, 100]).range([actualHeight, 0]);

        console.log("The stage is set");

    });
    mapImage.src = mapData;
}

loadMap();

var selectedShip;

var fps = d3.select("#fps span");

var setupGame = function () {
    var initState = gameState;
    var SHIPSIZE = 10;

    // Come up with a random color for each ship
    initState.map(function (d) {
        //d.color = "hsl(" + Math.random() * 360 + ",75%, 50%)";
        d.color = '#'+'0123456789ABCDEF'.split('').map(function(v,i,a){
                return i>5 ? null : a[Math.floor(Math.random()*16)] }).join('');
        d.colorAsInt = parseInt('0x' + d.color.slice(1));
    });

    // Show each player
    var playerContainer = playerDiv.append("ul");
    var players = playerContainer.selectAll("li")
        .data(initState);

    players.exit().remove();
    players.enter().append("li").append("button")
        .attr("title", "Click to select")
        .on("click", function (d, i) {
            console.log("Selecting ship for player " + d.id);
            selectedShip = i;
        })
        .style("color", function (d, i) {
            return d.color;
        })
        .text(function (d, i) {
            return d.id;
        });

    ships3D = initState.map(function(d){
        var r = rectangle(200, 150, SHIPSIZE, SHIPSIZE, d.colorAsInt, 0x000000, 1);
        stage.addChild(r);
        return r;
    });

    // Trigger the first full draw
    updateState();

};



var updateState = function (highResTimestamp) {

    requestID = requestAnimationFrame(updateState);

    if (updates >= draws) {
        // Only update the ships if we have gotten an update from the server
        draws += 1;

        // Calculate an fps counter
        if (fpsqueue.length >= 100) {
            fps.text(d3.mean(fpsqueue).toFixed(0));
            fpsqueue = fpsqueue.slice(1, 100);
        }
        fpsqueue.push(Math.round(1000 / (highResTimestamp - lastUpdateTime)));
        lastUpdateTime = highResTimestamp;


        for (var i = 0; i < ships3D.length; i++) {
            var cube = ships3D[i];
            var d = gameState[i];

            cube.rotation = (90 - d.theta * 360 / (2 * Math.PI));
            cube.position.x = x(d.x);
            cube.position.y = y(d.y);
        }

        // render the container
        renderer.render(stage);

    }
};


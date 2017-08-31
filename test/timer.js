'use strict';

function timerFactory () {
    var max = 0;
    var total = 0;
    var startTime = 0;


    function start() {
        startTime = process.hrtime();
    }

    function stop() {
        total += process.hrtime(startTime)[1] / Math.pow(10, 6);
        startTime = 0;
    }

    function getTotal() {
        return total;
    }

    function reset() {
        total = 0;
    }

    function report() {
        console.log('Run time: %dms', total);

        if(total > max) {
            console.log('Long run detected: %dms', total);
        }
    }

    function setMaxAcceptableTime (maxMs) {
        max = maxMs;
    }

    return {
        getTotal: getTotal,
        reset: reset,
        report: report,
        setMaxAcceptableTime: setMaxAcceptableTime,
        start: start,
        stop: stop
    };
}

module.exports = timerFactory;
const EventEmitter = require('events');

class TimerClock extends EventEmitter
{
    constructor(type, duration, rate)
    {
        super();
        this.type = type;
        this.duration = duration;
        this.rate = rate;
        this.value = this.type === TimerClock.TIMER_UP ? 0:this.duration;
        this._tick = this._tick.bind(this);
        this.isStarted = false;
    }

    reset (duration)
    {
        this.stop();
        if (typeof duration !== 'undefined') this.duration = duration;
        this.value = this.type === TimerClock.TIMER_UP ? 0:this.duration;
    }

    start ()
    {
        if (this.isStarted) return;
        this.value = this.value || (this.type === TimerClock.TIMER_UP ? 0:this.duration);
        this.startedAt = new Date().getTime();
        if (this._interval) clearInterval(this._interval);
        process.nextTick(() => this._interval = setInterval(this._tick, this.rate));
        this.isStarted = true;
        this.emit('tick', this.value);
    }

    stop ()
    {
        if (!this.isStarted) return;
        this.isStarted = false;
        var delta = new Date().getTime() - this.startedAt;
        if (this.type === TimerClock.TIMER_UP)
        {
            this.value = delta;
        }
        else
        {
            this.value = this.duration - delta;
        }
        if (!this._interval) return;
        clearInterval(this._interval);
        this._interval = null;
    }

    _tick ()
    {
        var delta = new Date().getTime() - this.startedAt;
        if (this.type === TimerClock.TIMER_UP)
        {
            this.value = delta;
            if (this.value >= this.duration)
            {
                this.value = this.duration;
                this.emit('tick', this.value);
                this.emit('end');
                clearInterval(this._interval);
                this._interval = null;
                return;
            }
            this.emit('tick', this.value);
        }
        else
        {
            this.value = this.duration - delta;
            if (this.value <= 0)
            {
                this.value = 0;
                this.emit('tick', this.value);
                this.emit('end');
                clearInterval(this._interval);
                this._interval = null;
                return;
            }
            this.emit('tick', this.value);
        }
    }


    addListeners(listeners)
    {
        for (var i in listeners)
        {
            this.on(i,listeners[i]);
        }
        return this;
    };

    removeListeners (listeners)
    {
        for (var i in listeners)
        {
            this.removeListener(i, listeners[i]);
        }
        return this;
    };

}

TimerClock.TIMER_UP = 1;
TimerClock.TIMER_DOWN = -1;

module.exports = exports = TimerClock;
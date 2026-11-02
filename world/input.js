// Keyboard, mouse, touch and gamepad, read as one set of controls:
// move (x, y), look (dx, dy), zoom, run, jump, use (A) and back (B).
export class Input {
  constructor(el) {
    this.keys = new Set();
    this.look = { dx: 0, dy: 0 };
    this.zoom = 0;
    this.pressed = new Set();       // edge-triggered: 'use', 'jump', 'back'
    this.touch = { move: null, look: null, mx: 0, my: 0 };
    this.mouse = null;
    const press = (k) => this.pressed.add(k);
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (['KeyE', 'Enter', 'KeyX'].includes(e.code)) press('use');
      if (e.code === 'Space') press('jump');
      if (e.code === 'KeyC') press('recenter');
      if (['Escape', 'KeyZ', 'Backspace'].includes(e.code)) press('back');
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => { this.mouse = { x: e.clientX, y: e.clientY }; });
    addEventListener('mouseup', () => { this.mouse = null; });
    addEventListener('mousemove', (e) => {
      if (!this.mouse && document.pointerLockElement !== el) return;
      this.look.dx += e.movementX; this.look.dy += e.movementY;
    });
    el.addEventListener('wheel', (e) => { this.zoom += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    // touch: left half moves (a floating stick), right half looks
    const stick = document.getElementById('stick'), knob = document.getElementById('knob');
    el.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth / 2 && !this.touch.move) {
          this.touch.move = { id: t.identifier, x: t.clientX, y: t.clientY };
          if (stick) { stick.style.display = 'block'; stick.style.left = t.clientX + 'px'; stick.style.top = t.clientY + 'px'; }
        } else if (!this.touch.look) this.touch.look = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
      e.preventDefault();
    }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        const m = this.touch.move, l = this.touch.look;
        if (m && t.identifier === m.id) {
          let dx = t.clientX - m.x, dy = t.clientY - m.y; const d = Math.hypot(dx, dy), max = 50;
          if (d > max) { dx *= max / d; dy *= max / d; }
          this.touch.mx = dx / max; this.touch.my = dy / max;
          if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
        } else if (l && t.identifier === l.id) {
          this.look.dx += (t.clientX - l.x) * 1.5; this.look.dy += (t.clientY - l.y) * 1.5;
          l.x = t.clientX; l.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (this.touch.move && t.identifier === this.touch.move.id) {
          this.touch.move = null; this.touch.mx = this.touch.my = 0;
          if (stick) stick.style.display = 'none';
          if (knob) knob.style.transform = '';
        }
        if (this.touch.look && t.identifier === this.touch.look.id) this.touch.look = null;
      }
    };
    el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
    for (const [id, k] of [['btnA', 'use'], ['btnJump', 'jump']]) {
      const b = document.getElementById(id);
      if (b) b.addEventListener('touchstart', (e) => { press(k); e.preventDefault(); e.stopPropagation(); }, { passive: false });
    }
    this.padPrev = {};
  }

  // Call once a frame. Returns the controls for this frame.
  read(dt = 1 / 60) {
    const k = (c) => this.keys.has(c);
    let x = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
    let y = (k('KeyS') ? 1 : 0) - (k('KeyW') ? 1 : 0);
    let run = k('ShiftLeft') || k('ShiftRight');
    let lx = this.look.dx, ly = this.look.dy;
    // the arrow keys (and Q / R) turn the camera, so each hand has a job
    const f = dt * 60;
    if (k('KeyQ') || k('ArrowLeft')) lx -= 12 * f; if (k('KeyR') || k('ArrowRight')) lx += 12 * f;
    if (k('ArrowUp')) ly -= 8 * f; if (k('ArrowDown')) ly += 8 * f;
    x += this.touch.mx; y += this.touch.my;
    if (Math.hypot(this.touch.mx, this.touch.my) > 0.92) run = true;
    // gamepad
    const pad = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (pad) {
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      x += dz(pad.axes[0]); y += dz(pad.axes[1]);
      lx += dz(pad.axes[2]) * 14; ly += dz(pad.axes[3]) * 10;
      const b = (i) => pad.buttons[i] && pad.buttons[i].pressed;
      if (b(0) && !this.padPrev[0]) this.pressed.add('use');
      if (b(1) && !this.padPrev[1]) this.pressed.add('back');
      if (b(2) && !this.padPrev[2]) this.pressed.add('jump');
      if (b(6) && !this.padPrev[6]) this.pressed.add('recenter');   // ZL / L2: camera behind the player
      if (b(10) || b(5)) run = true;
      for (const i of [0, 1, 2, 6]) this.padPrev[i] = b(i);
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    const out = { x, y, run, lx, ly, zoom: this.zoom, pressed: this.pressed };
    this.look.dx = this.look.dy = 0; this.zoom = 0;
    this.pressed = new Set();
    return out;
  }
}

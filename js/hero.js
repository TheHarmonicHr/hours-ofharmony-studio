   const SimplexNoise = function() {
      var F3 = 1.0/3.0, G3 = 1.0/6.0;
      var p = new Uint8Array(256);
      for (var i=0; i<256; i++) p[i] = Math.floor(Math.random()*256);
      var perm = new Uint8Array(512), permMod12 = new Uint8Array(512);
      for (var i=0; i<512; i++) {
        perm[i] = p[i & 255];
        permMod12[i] = (perm[i] % 12);
      }
      return {
        noise2D: function(xin, yin) {
          var n0, n1, n2;
          var s = (xin+yin)*0.5*(Math.sqrt(3.0)-1.0);
          var i = Math.floor(xin+s), j = Math.floor(yin+s);
          var t = (i+j)*(3.0-Math.sqrt(3.0))/6.0;
          var X0 = i-t, Y0 = j-t;
          var x0 = xin-X0, y0 = yin-Y0;
          var i1, j1;
          if(x0>y0) {i1=1; j1=0;} else {i1=0; j1=1;}
          var x1 = x0 - i1 + (3.0-Math.sqrt(3.0))/6.0, y1 = y0 - j1 + (3.0-Math.sqrt(3.0))/6.0;
          var x2 = x0 - 1.0 + 2.0*(3.0-Math.sqrt(3.0))/6.0, y2 = y0 - 1.0 + 2.0*(3.0-Math.sqrt(3.0))/6.0;
          var ii = i & 255, jj = j & 255;
          var gi0 = permMod12[ii+perm[jj]], gi1 = permMod12[ii+i1+perm[jj+j1]], gi2 = permMod12[ii+1+perm[jj+1]];
          var t0 = 0.5 - x0*x0-y0*y0; if(t0<0) n0 = 0.0; else { t0 *= t0; n0 = t0 * t0 * (gi0%2 === 0 ? 1 : -1)*(x0 + y0)*(gi0 > 4 ? gi0 > 8 ? 1 : -1 : 1); }
          var t1 = 0.5 - x1*x1-y1*y1; if(t1<0) n1 = 0.0; else { t1 *= t1; n1 = t1 * t1 * (gi1%2 === 0 ? 1 : -1)*(x1 + y1)*(gi1 > 4 ? gi1 > 8 ? 1 : -1 : 1); }
          var t2 = 0.5 - x2*x2-y2*y2; if(t2<0) n2 = 0.0; else { t2 *= t2; n2 = t2 * t2 * (gi2%2 === 0 ? 1 : -1)*(x2 + y2)*(gi2 > 4 ? gi2 > 8 ? 1 : -1 : 1); }
          return 70.0 * (n0 + n1 + n2);
        }
      };
    };

    const TOP_LINE = ""; // Smaller line above the main word (set to "" to hide)
    const MY_NAME = "harmony"; // Change this to your name!
    const MAX_PARTICLES = 3000;
    // Respect the visitor's system setting for reduced motion
    const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const WIND_STRENGTH = REDUCED_MOTION ? 0 : 0.2;

    const canvas = document.getElementById('noiseCanvas');
    const ctx = canvas.getContext('2d');
    const simplex = SimplexNoise();

    let width = window.innerWidth;
    let height = window.innerHeight;
    let points = [];
    let particles = [];
    let frameCount = 0;
    let mouse = { x: -1000, y: -1000 };
    let stillMoving = true;
    let wordY = 0.42;

    window.addEventListener('mousemove', (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    });
    window.addEventListener('mouseleave', () => { mouse.x = -1000; mouse.y = -1000; });
    window.addEventListener('touchmove', (e) => {
      mouse.x = e.touches[0].clientX;
      mouse.y = e.touches[0].clientY;
    }, { passive: true });
    window.addEventListener('touchend', () => { mouse.x = -1000; mouse.y = -1000; });

    function initCanvas() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      generateTextPoints();
      createParticles();
    }

    function generateTextPoints() {
      points = [];
      const memCanvas = document.createElement('canvas');
      const memCtx = memCanvas.getContext('2d');
      memCanvas.width = width;
      memCanvas.height = height;

      memCtx.fillStyle = '#ffffff';
      let fontSize = Math.min(width * 0.12, 120);
      const FONT = (size) => `800 ${size}px "Exo 2", "Arial Black", sans-serif`;
      memCtx.font = FONT(fontSize);
      // Left margin: 8% of the screen, but never less than 24px
      const marginX = Math.max(24, width * 0.08);
      const maxTextWidth = width - marginX * 2;
      // Shrink the text if it would overflow the screen
      const measured = memCtx.measureText(MY_NAME).width;
      if (measured > maxTextWidth) {
        fontSize *= maxTextWidth / measured;
        memCtx.font = FONT(fontSize);
      }
      memCtx.textAlign = 'left';
      memCtx.textBaseline = 'middle';

      // Vertical position of the word, as a fraction of screen height
      const mainY = height * wordY;
      memCtx.fillText(MY_NAME, marginX, mainY);

      // Smaller top line, about 40% of the main size
      const smallSize = fontSize * 0.4;
      if (TOP_LINE) {
        memCtx.font = FONT(smallSize);
        memCtx.fillText(TOP_LINE, marginX, mainY - fontSize * 0.8);
      }

      // Sample more finely when text is small (e.g. on phones) so thin strokes aren't missed
      const SAMPLE = smallSize < 40 ? 2 : 4;

      const imgData = memCtx.getImageData(0, 0, width, height).data;

      for (let x = 0; x < width; x += SAMPLE) {
        for (let y = 0; y < height; y += SAMPLE) {
          let alphaIndex = ((y * width) + x) * 4 + 3;
          if (imgData[alphaIndex] > 128) {
            points.push({ x: x, y: y });
          }
        }
      }
    }

    function createParticles() {
      particles = [];
      const count = Math.max(1, Math.min(points.length, MAX_PARTICLES));
      for (let i = 0; i < count; i++) {
        // Spread targets evenly across every letter instead of picking randomly
        let target = points.length > 0 ? points[Math.floor(i * points.length / count)] : { x: width/2, y: height/2 };
        particles.push({
          // Start every particle already in place, so the page opens on the finished word
          x: target.x,
          y: target.y,
          vx: 0,
          vy: 0,
          targetX: target.x,
          targetY: target.y,
          maxSpeed: Math.random() * 1.5 + 4,
          maxForce: 0.25
        });
      }
    }

    function animate() {
      frameCount++;

      ctx.fillStyle = stillMoving ? 'rgba(241, 244, 238, 0.1)' : 'rgb(241, 244, 238)';
      ctx.fillRect(0, 0, width, height);
      let movingThisFrame = false;

      // Each particle picks its own color below, based on how fast it's moving
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';

      for (let i = 0; i < particles.length; i++) {
        let p = particles[i];

        let noiseScale = 0.008; // Higher = smaller, tighter swirls; lower = broad currents
        let angle = simplex.noise2D(p.x * noiseScale, p.y * noiseScale + frameCount * 0.002) * Math.PI * 2;
        let windX = Math.cos(angle) * WIND_STRENGTH;
        let windY = Math.sin(angle) * WIND_STRENGTH;

        let dx = p.targetX - p.x;
        let dy = p.targetY - p.y;
        let dist = Math.sqrt(dx * dx + dy * dy);

        let targetVx = dx;
        let targetVy = dy;

        if (dist > 0) {
          // Long, gentle slowdown so particles glide to rest like water settling
          let speed = dist < 120 ? (dist / 120) * p.maxSpeed : p.maxSpeed;
          targetVx = (dx / dist) * speed;
          targetVy = (dy / dist) * speed;
        }

        let steerX = targetVx - p.vx;
        let steerY = targetVy - p.vy;

        let steerMag = Math.sqrt(steerX * steerX + steerY * steerY);
        if (steerMag > p.maxForce) {
          steerX = (steerX / steerMag) * p.maxForce;
          steerY = (steerY / steerMag) * p.maxForce;
        }

        let mDx = p.x - mouse.x;
        let mDy = p.y - mouse.y;
        let mDist = Math.sqrt(mDx * mDx + mDy * mDy);
        if (mDist > 0 && mDist < 80) {
          let pushForce = (80 - mDist) / 80 * 3;
          p.vx += (mDx / mDist) * pushForce;
          p.vy += (mDy / mDist) * pushForce;
        }

        // Wind guides particles in, then almost fully stills once they reach the letters
        let windScale = Math.min(dist / 60, 1) * 0.98 + 0.02;
        p.vx += steerX + windX * windScale;
        p.vy += steerY + windY * windScale;
        p.vx *= 0.97;
        p.vy *= 0.97;

        let speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed > 0.3) movingThisFrame = true;
        if (speed > p.maxSpeed) {
          p.vx = (p.vx / speed) * p.maxSpeed;
          p.vy = (p.vy / speed) * p.maxSpeed;
        }

        // Resting particles are deep green; moving ones warm toward the orange accent.
        // Blending in HSL (hue, saturation, lightness) passes through yellow-green
        // instead of muddy brown.
        let heat = Math.min(Math.sqrt(p.vx * p.vx + p.vy * p.vy) / 2.5, 1);
        let h = 136 + (25 - 136) * heat;  // hue: green 136 -> orange 25
        let s = 43 + (76 - 43) * heat;    // saturation
        let l = 21 + (48 - 21) * heat;    // lightness
        let color = `hsla(${h}, ${s}%, ${l}%, 0.85)`;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;

        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        p.x += p.vx;
        p.y += p.vy;
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        // Draw a round dot so settled particles stay visible
        ctx.beginPath();
        ctx.arc(p.x, p.y, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      stillMoving = movingThisFrame;
      requestAnimationFrame(animate);
    }

    // Wait for the web font before sampling the letters, but never longer than 1.5s
    let started = false;
    function start() {
      if (started) return;
      started = true;
      initCanvas();
      animate();
    }
    document.fonts.load('800 100px "Exo 2"').catch(() => {}).finally(start);
    setTimeout(start, 1500);

    window.addEventListener('resize', initCanvas);
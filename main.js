/**
 * Let us define an anonymous function that takes no inputs and then immediately returns with 
 * the contents of our game. 
*/
(() => {
  // Set up the canvas
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // Ensure that we can focus on the canvas
  // Include a focus helper function
  canvas.tabIndex = 0;

  function focusCanvas() {
    // prevent scrolling
    try { 
      canvas.focus({ 
        preventScroll: true 
      }); 
    } catch {
      // don't catch anything
    } 
  }

  /**
   * Set up consts needed for the user display.
   * This includes the time (score), apples collected, lives, and 
   * critical buttons like the start and reset button.
   */
  const $ = (id) => document.getElementById(id);
  const timerElement = $("timer");
  const applesElement = $("apples");
  const livesElement = $("lives");
  const bestTimeElement = $("bestTime");
  const bestApplesElement = $("bestApples");
  const pauseCountElement = $("pauseCount");
  const startOverlay = $("startOverlay"); 
  const gameOverOverlay = $("gameOverOverlay");
  const startBtn = $("startBtn") ;
  const playAgainBtn = $("playAgain");
  const finalScore = $("finalScore");
  const pauseBtn = $("pauseBtn");
  let paused = false;
  
  // sprites (no sprite animation)
  const SPRITES = {
    bg: "background_image.png",
    player: "player_block.png",
    enemy: "evil_block.png",
    apple: "apple_image.png",
  };

  const img = {};

  /**
   * Load an image and put it in img map
   * ie img[k]
   */
  const loadImage = (k, src) => new Promise((res, rej) => {
    const i = new Image(); 
    i.onload = () => res(img[k] = i); 
    i.onerror = rej; 
    i.src = src;
  });

  /**
   * Local storage statistics
   */
  const store = {
    get nPause() { 
      return +(localStorage.getItem("nPause") || 0); 
    },
    
    set nPause(v){ 
      localStorage.setItem("nPause", v); 
    },

    get bestTime(){ 
      return +(localStorage.getItem("bestTime") || 0); 
    },

    set bestTime(v){ 
      localStorage.setItem("bestTime", v); 
    },

    get bestApples(){ 
      return +(localStorage.getItem("bestApples") || 0); 
    },

    set bestApples(v){ 
      localStorage.setItem("bestApples", v); 
    },
  };

  // display the persistent local stoage stats in the appropriate locations
  const refreshMetricsUI = () => {
    bestTimeElement.textContent = store.bestTime;
    bestApplesElement.textContent = store.bestApples;
    pauseCountElement.textContent = store.nPause;
  }; 
  
  refreshMetricsUI(); // always call

  // constants for the background/world
  const W = canvas.width;
  const H = canvas.height;
  const GROUND_Y = 560;
  const GRAV = 0.5;
  const FRICTION = 0.86;
  const MAX_VX = 10;

  // enemies 
  // spawn from the side with random speed
  // difficulty increases; as time goes on, speed increases
  let ENEMY_MIN = 2.8; 
  let ENEMY_MAX = 4.4;
  const ENEMY_MAX_CAP = 9.5;
  const ENEMY_W = 42; 
  const ENEMY_H = 42;
  const ENEMY_GROUND_Y = GROUND_Y - ENEMY_H/2; 

  // player
  const PLAYER = { 
    x: W/2, 
    y: H/2, 
    w: 44, 
    h: 44, 
    vx: 0, 
    vy: 0, 
    onGround: false, 
    anim: 0 
  };

  // apple and enemies entities
  let apples = [];
  let enemies = [];
  let state = "idle";
  let frames = 0;
  let seconds = 0;
  let lives = 3;
  let applesCollected = 0;
  let appleEvery = 60;
  let enemyEvery = 100;
  let spawnTick = 0;

  // key input
  // const keys = new Set();
  const isDown = { 
    left:false, 
    right:false 
  };

  // mouse follows if inside scope and moving
  let mouseInside = false;
  let mouseX = PLAYER.x;
  let lastMoveAt = 0;
  const MOUSE_ACTIVE_MS = 180;

  canvas.addEventListener("mouseenter", () => { 
    mouseInside = true; 
  });
  
  canvas.addEventListener("mouseleave", () => {
    mouseInside = false;
    PLAYER.vx = 0;
  });

  canvas.addEventListener("mousemove", e=>{
    const r = canvas.getBoundingClientRect();
    mouseX = (e.clientX - r.left) * (canvas.width / r.width);
    lastMoveAt = performance.now();
  });

  // limit v between a and b inclusive
  const limit = (v,a,b) => (
    Math.max(a, Math.min(b,v))
  );

  const overlap = (a,b) => (
    Math.abs(a.x-b.x) * 2 < (a.w+b.w) && Math.abs(a.y-b.y) * 2 <(a.h+b.h)
  );

  
  // updates the metrics above the gameplay canvas 
  function updateMetrics() { 
    timerElement.textContent = `Time: ${seconds}s`; 
    applesElement.textContent = `Apples: ${applesCollected}`; 
    livesElement.textContent = `Lives: ${lives}`; 
  }

  // resets the game to the beginning states
  function resetGame(first=false){
    // if(!first) {  // ensure not the first time playing the game for the local storage stats 
    //   store.nReset = store.nReset + 1; 
    //   pauseCountElement.textContent = store.nReset; 
    // }
    
    // reset everything back to 0
    // and reset difficulty for the enemies spawning back to initial vals
    apples = []; 
    enemies = [];
    frames = 0;
    seconds = 0; 
    lives = 3; 
    applesCollected = 0;
    appleEvery = 60; 
    enemyEvery = 100; 
    spawnTick = 0;
    ENEMY_MIN = 2.8; 
    ENEMY_MAX = 4.4;

    // suspend player block back into the air to drop
    Object.assign(PLAYER, {
      x: W/2, 
      y: H/2, 
      vx:0, 
      vy:0, 
      onGround:false
    });

    state = "idle";
    updateMetrics();
  }

  // call startDrop after player is suspended back in the air, post reset
  function startDrop(){
    if (state!=="idle" && state!=="over") {
      return;
    }

    state = "drop";

    startOverlay.classList.remove("show");
    gameOverOverlay.classList.remove("show");

    PLAYER.onGround = false;
    PLAYER.vx = 0; PLAYER.vy = 0.01;
  }

  // begins the player's run
  // sets state to run, beginning enemies/apples spawning
  function beginRun(){
    apples = []; 
    enemies = [];
    frames = 0; 
    seconds = 0; 
    spawnTick = 0;
    state = "run";
    updateMetrics();
  }

  // ends the game when lives is 0
  function endGame(){
    state = "over";

    // update the local storage for seconds alive
    // and number of apples collected
    // these serve as the 'high scores'
    if (seconds > store.bestTime) {
      store.bestTime = seconds;
    }

    if (applesCollected > store.bestApples) {
      store.bestApples = applesCollected;
    }

    // refresh the metrics from local storage
    refreshMetricsUI();
    finalScore.textContent = `You survived ${seconds} seconds and collected ${applesCollected} apples.`;
    
    gameOverOverlay.classList.add("show");
  }

  // listen to space bar to jump
  document.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();

    if (e.code === "Space") {
      e.preventDefault();
    }

    // others in case
    if (k === " " || k === "arrowup" || k === "w") {
      doJump();
      return;
    }
  });


  // space bar
  document.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (e.code === "Space") {
      e.preventDefault();
    }
  });

  canvas.addEventListener("mousedown", (e) => {
    e.preventDefault();
    doJump();
    focusCanvas();
  });

  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    doJump();
    focusCanvas();
  }, { passive: false });

  // jumps the character w/ gravity
  function doJump(){
    if (state !== "run") return;
    if (PLAYER.onGround) { 
      PLAYER.vy =- 10.2; 
      PLAYER.onGround = false; 
    }
  }

  // starts the game
  startBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.currentTarget.blur();
    startDrop();
    focusCanvas(); // ensure space button doesn't keep resetting canvas
  });

  // reset the game state
  playAgainBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.currentTarget.blur();
    resetGame(true);
    startDrop();
    focusCanvas();
  });

  // pause the game
  // when paused, text content becomes resume
  pauseBtn.addEventListener("click", (e) => {
    e.preventDefault();
    // e.stopPropagation();
    e.currentTarget.blur();
    
    paused = !paused;

    // count number of pauses for local storage vibes
    if (paused) {
      store.nPause = store.nPause + 1;
      pauseCountElement.textContent = store.nPause;
      pauseBtn.textContent = "Resume";
    } else {
      pauseBtn.textContent = "Pause"; 
    }
  });

  // spawns apples at random locations within the frame
  const spawnApple = () => {
    const x = 60 + Math.random() * (W-120);
    apples.push({ 
      x, y: -20, 
      w: 28, 
      h: 28, 
      vy: 2, 
      ay: GRAV 
    });
  };
  
  // generate random number from min and max arguments
  function rand(min,max) { 
    return min + Math.random()*(max-min); 
  }

  // spawns our enemies
  // random sides and speeds
  const spawnEnemyFromSide = () => {
    const side = Math.random() < 0.5 ? "left" : "right";
    const speed = rand(ENEMY_MIN, ENEMY_MAX);

    // ensure on the ground
    const y = ENEMY_GROUND_Y;

    // if spawn from left, speed right
    if (side === "left") {
      enemies.push({ 
        x: -ENEMY_W,
        y, w: ENEMY_W, 
        h: ENEMY_H, 
        vx: +speed 
      });
    } else { // if spawn from right, speed to the left
      enemies.push({ 
        x: W + ENEMY_W, 
        y, w: ENEMY_W, 
        h: ENEMY_H, 
        vx: -speed 
      });
    }
  };

  // step through every frame
  function step () {
    // stop all frames if paused is true
    if (paused) {
      requestAnimationFrame(step);
      return;
    }

    // if the player is dropping, ensure the following
    if (state === "drop") {
      // fall with gravity
      PLAYER.vx = 0;
      PLAYER.vy += GRAV;
      PLAYER.y  += PLAYER.vy;

      // begin run once the player touches the ground
      if (PLAYER.y + PLAYER.h/2 >= GROUND_Y) {
        PLAYER.y = GROUND_Y - PLAYER.h/2;
        PLAYER.vy = 0; 
        PLAYER.onGround = true;
        beginRun();
      }
    } else if (state === "run") {
      // if player is already running
      frames++; 
      spawnTick++;

      if (frames % 30 === 0) {
        seconds++;
        
        if(seconds % 5 === 0){
          enemyEvery = Math.max(55, enemyEvery - 4);
          appleEvery = Math.max(28, appleEvery - 1);
          ENEMY_MIN = Math.min(ENEMY_MAX_CAP-1.0, ENEMY_MIN + 0.3);
          ENEMY_MAX = Math.min(ENEMY_MAX_CAP, ENEMY_MAX + 0.45);
        }

        // update after every step
        updateMetrics();
      }

      let ax = 0;

      // ensure mouse movement actually moves player
      // IF mouse is within the game frame, not if it leaves the frame
      // if mouse leaves frame, movement stops
      const recentlyMoved = (performance.now() - lastMoveAt) <= MOUSE_ACTIVE_MS;
      
      if (mouseInside && recentlyMoved) {
        const dx = mouseX - PLAYER.x;
        ax += limit(dx * 0.18, -3.2, 3.2);
      } else {
        PLAYER.vx *= 0.5;

        if (Math.abs(PLAYER.vx) < 0.15) {
          PLAYER.vx = 0;
        }
      }

      if(isDown.left) {
        ax -= 1.6;
      }

      if(isDown.right) {
        ax += 1.6;
      }

      if (Math.abs(ax) < 0.0001) {
        PLAYER.vx *= FRICTION;
      } else {
        PLAYER.vx = limit(PLAYER.vx + ax, -MAX_VX, MAX_VX);
      }

      PLAYER.x += PLAYER.vx;
      PLAYER.x = limit(PLAYER.x, PLAYER.w/2, W-PLAYER.w/2);
      
      if (!PLAYER.onGround) {
        PLAYER.vy += GRAV;
      }

      PLAYER.y += PLAYER.vy;

      if (PLAYER.y + PLAYER.h/2 >= GROUND_Y) {
        PLAYER.y = GROUND_Y - PLAYER.h/2; 
        PLAYER.vy = 0; 
        PLAYER.onGround = true; 
      }

      if (spawnTick % appleEvery === 0) {
        spawnApple();
      }

      if (spawnTick % enemyEvery === 0) {
        spawnEnemyFromSide();
      }

      for (let i = apples.length-1; i >= 0; i--) {
        const a = apples[i]; 
        a.vy += a.ay; 
        a.y += a.vy;

        if (a.y - a.h/2 > H) { 
          apples.splice(i,1); 
          continue; 
        }
        
        // removed apple's healing ability becaues it was too easy to
        // just stay in one position

        if (overlap(PLAYER, a)) { 
          apples.splice(i,1); 
          applesCollected++; 
          // lives++; 
          updateMetrics(); 
        }
      }

      // add damage when user touches an enemy
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        e.x += e.vx;
        e.y = ENEMY_GROUND_Y;
        if (e.x < -e.w*1.5 || e.x > W + e.w*1.5) { 
          enemies.splice(i,1); 
          continue; 
        }
        
        // end game if lives is 0
        if (overlap(PLAYER, e)) {
          enemies.splice(i,1);
          lives--; 
          updateMetrics();
          if (lives <= 0) {
            endGame();
          }
        }
      }
    }

    if (img.bg) {
      ctx.drawImage(img.bg, 0, 0, W, H); 
    }

    // the 'ground' beneath the trees
    ctx.fillStyle="#2a7f2a"; 
    ctx.fillRect(0, GROUND_Y, W, H-GROUND_Y);

    for (const a of apples) { 
      if(img.apple) {
        ctx.drawImage(img.apple, a.x - a.w/2, a.y - a.h/2, a.w, a.h);
      } 
    }
    
    for (const e of enemies) { 
      if (img.enemy) {
        ctx.drawImage(img.enemy, e.x - e.w/2, e.y - e.h/2, e.w, e.h); 
      } 
    }

    PLAYER.anim = (PLAYER.anim + 1) % 20; 
    // give player a little stretching effect when it is on the ground
    // a kind of half sprite animation

    const wobble = PLAYER.onGround ? (PLAYER.anim < 10 ? 1.0:0.92) : 1.0;
    const pw = PLAYER.w * wobble;
    const ph = PLAYER.h / wobble;
    
    if (img.player) {
      ctx.drawImage(img.player, PLAYER.x - pw/2, PLAYER.y - ph/2, pw, ph);
    } 
    requestAnimationFrame(step);
  }

  Promise.all(Object.entries(SPRITES).map(([k,src])=>loadImage(k,src)))
    .catch(()=>{})
    .finally(()=>{ 
      startOverlay.classList.add("show");
      resetGame(true);
      requestAnimationFrame(step);
    });
})();

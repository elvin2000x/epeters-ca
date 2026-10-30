(function () {
  var progress = document.getElementById("progress");
  var level = document.getElementById("level");
  var ask = document.getElementById("ask");
  var board = document.getElementById("board");
  var choices = document.getElementById("choices");
  var meter = document.getElementById("meter");
  var nextWrap = document.getElementById("next-wrap");
  var nextBtn = document.getElementById("next");
  var play = document.getElementById("play");
  var locked = document.getElementById("locked");
  var again = document.getElementById("again");
  var scene = document.getElementById("scene");
  var sceneCopy = document.getElementById("scene-copy");
  var sceneGo = document.getElementById("scene-go");
  var list = [];
  var index = 0;
  var R = window.Resistor;

  function currentLesson() {
    var prev = index === 0 ? null : list[index - 1].level;
    return R.lessonBefore(list[index].level, prev);
  }

  function showLesson(lesson) {
    play.hidden = true;
    scene.hidden = false;
    locked.hidden = true;
    progress.textContent = lesson.n + " of 3";
    level.textContent = lesson.title;
    sceneCopy.innerHTML = "";
    lesson.blocks.forEach(function (block) {
      if (block.picture) {
        var board = document.createElement("div");
        board.className = "board";
        board.innerHTML = R.draw(block.picture, block.chosen);
        sceneCopy.appendChild(board);
        return;
      }
      var p = document.createElement("p");
      if (block.rule) { p.className = "rule"; p.textContent = block.rule; }
      if (block.work) { p.className = "work"; p.textContent = block.work; }
      if (block.tease) { p.className = "tease"; p.textContent = block.tease; }
      sceneCopy.appendChild(p);
    });
    sceneGo.focus();
  }

  function showPuzzle() {
    var puzzle = list[index];
    play.hidden = false;
    scene.hidden = true;
    locked.hidden = true;
    progress.textContent = (index + 1) + " of " + list.length;
    level.textContent = "Level " + puzzle.level + ". " + puzzle.level_name;
    ask.textContent = R.targetSentence(puzzle);
    board.innerHTML = R.draw(puzzle, null);
    meter.textContent = "Pick a resistor.";
    meter.className = "meter";
    nextWrap.hidden = true;
    choices.innerHTML = "";
    puzzle.tray_ohm.forEach(function (ohm) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = ohm + " \u03A9";
      btn.addEventListener("click", function () { pick(ohm, btn); });
      choices.appendChild(btn);
    });
  }

  function pick(ohm, btn) {
    var puzzle = list[index];
    var reading = R.formatReading(puzzle, ohm);
    board.innerHTML = R.draw(puzzle, ohm);
    Array.prototype.forEach.call(choices.children, function (el) {
      el.classList.remove("picked", "good");
      el.disabled = false;
    });
    btn.classList.add("picked");
    if (R.isHit(puzzle, ohm)) {
      btn.classList.add("good");
      Array.prototype.forEach.call(choices.children, function (el) { el.disabled = true; });
      meter.textContent = reading + ". That's the one.";
      meter.className = "meter good";
      if (index + 1 >= list.length) nextBtn.textContent = "Finish";
      else if (list[index + 1].level !== puzzle.level) nextBtn.textContent = "Next idea";
      else nextBtn.textContent = "Next";
      nextWrap.hidden = false;
      nextBtn.focus();
    } else {
      meter.textContent = "That reads " + reading + ". Try another value.";
      meter.className = "meter bad";
      nextWrap.hidden = true;
    }
  }

  function arrive() {
    var lesson = currentLesson();
    if (lesson) showLesson(lesson);
    else showPuzzle();
  }

  function finish() {
    play.hidden = true;
    scene.hidden = true;
    locked.hidden = false;
    progress.textContent = list.length + " of " + list.length;
    if (window.PUZZLE_MODE === "all") {
      level.textContent = "That's the set.";
      document.getElementById("locked-line").textContent = "One hundred puzzles.";
    } else {
      level.textContent = "The rest of the set is not for sale yet.";
      document.getElementById("locked-line").textContent = "You played one puzzle from each level.";
    }
  }

  nextBtn.addEventListener("click", function () {
    if (index + 1 >= list.length) finish();
    else {
      index += 1;
      arrive();
    }
  });

  sceneGo.addEventListener("click", function () {
    showPuzzle();
  });

  again.addEventListener("click", function () {
    index = 0;
    arrive();
  });

  fetch("puzzles.json")
    .then(function (res) {
      if (!res.ok) throw new Error("status " + res.status);
      return res.json();
    })
    .then(function (all) {
      list = window.PUZZLE_MODE === "all" ? all : all.filter(function (p) { return p.open; });
      if (!list.length) throw new Error("empty");
      arrive();
    })
    .catch(function () {
      play.hidden = false;
      meter.textContent = "The puzzle list did not load. Open this page from the resistor-puzzles folder on the local site.";
    });
})();

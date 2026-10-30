var fs = require("fs");
var R = require("./circuit.js");
var puzzles = JSON.parse(fs.readFileSync("puzzles.json", "utf8"));
var fail = 0;
if (puzzles.length !== 100) fail++;
if (puzzles.filter(function (p) { return p.open; }).length !== 9) fail++;
if (!R.lessonBefore(1, null) || R.lessonBefore(1, null).n !== 1) fail++;
if (!R.lessonBefore(2, 1) || R.lessonBefore(2, 1).blocks.length < 4) fail++;
if (!R.lessonBefore(5, 4)) fail++;
if (R.lessonBefore(3, 2) || R.lessonBefore(6, 5) || R.lessonBefore(4, 3)) {
  console.log("lesson in the wrong place");
  fail++;
}
puzzles.forEach(function (p) {
  p.tray_ohm.forEach(function (ohm) {
    var hit = R.isHit(p, ohm);
    if (hit !== (ohm === p.answer_ohm)) {
      console.log("miss", p.id, ohm, "hit", hit, "reading", R.formatReading(p, ohm));
      fail++;
    }
    if (!R.formatReading(p, ohm) || !R.targetSentence(p) || !R.draw(p, null)) fail++;
  });
});
if (fail) {
  console.log("FAIL", fail);
  process.exit(1);
}
console.log("100 puzzles, one answer each");

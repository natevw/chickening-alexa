function* expand(utterance) {
  let plainWords = [];
  for (let group of utterance) {
    if (typeof group === 'string') plainWords.push(group);
    else {
      // (assume) array needing expansion
      if (group.length === 1) group = group.concat('')
      for (let option of group) {
        let filledUtterance = (option === '') ?
          [...plainWords, ...utterance.slice(plainWords.length+1)] :
          [...plainWords, option, ...utterance.slice(plainWords.length+1)];
        yield* expand(filledUtterance);
      }
      return;
    }
  }
  yield plainWords.join(' ');
}

function* expandAll(utterances) {
  for (let utterance of utterances) {
    yield* expand(utterance);
  }
}

function output(utterances) {
  for (let s of expandAll(utterances)) {
    process.stdout.write(`${s}\n`)
  }
}

const EGGS = ["egg", "eggs", "more egg", "more eggs"],
      MY = ["my", "our"], WE = ["I", "we"], COUNT = "{count}";

output([
  [["record"], COUNT, EGGS, ["laid"]],
  [MY, ["chicken", "chickens", "hen", "hens"], "laid", COUNT, EGGS],
  [WE, ["got", "found", "gathered"], COUNT, EGGS],
]);

console.log("---")

const TELL = ["tell me", "tell", ''];  //.concat("show", "show me");
output([
  [TELL, "how many eggs have we", ["got", "gotten"]],
  [TELL, "how many eggs have the", ["hens","chickens"], "laid"],
  [TELL, "how many eggs the", ["hens","chickens"], "have laid"],
  [TELL, "how many eggs has the", ["hen","chicken"], "laid"],
  [TELL, "how many eggs the", ["hen","chicken"], "has laid"],
  [["tell", "tell me", "what's", "what is"], "the egg count"]
]);

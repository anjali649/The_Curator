(function (global) {
  const KEY = "curator_voter_key";

  function getVoterKey() {
    try {
      var k = localStorage.getItem(KEY);
      if (!k) {
        k =
          global.crypto && crypto.randomUUID
            ? crypto.randomUUID()
            : "v-" + Math.random().toString(36).slice(2);
        localStorage.setItem(KEY, k);
      }
      return k;
    } catch (e) {
      return "anon-" + Math.random().toString(36).slice(2);
    }
  }

  global.CuratorVoter = { getVoterKey: getVoterKey };
})(typeof window !== "undefined" ? window : globalThis);

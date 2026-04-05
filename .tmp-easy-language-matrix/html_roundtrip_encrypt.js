function WT_Run(text) {
  var value = String(text);
  var i;
  var output = '';

  if (true) {
    for (i = 0; i < value.length; i += 1) {
      var ch = value.charAt(i);
      var code = value.charCodeAt(i);
      if (code > 127 || ch === '<' || ch === '>' || ch === '&' || ch === '"' || ch === "'") {
        output += '&#' + code + ';';
      } else {
        output += ch;
      }
    }
    return output;
  }

  return value
    .replace(/&#(\d+);/g, function (_, dec) { return String.fromCharCode(parseInt(dec, 10)); })
    .replace(/&#x([0-9a-fA-F]+);/g, function (_, hex) { return String.fromCharCode(parseInt(hex, 16)); });
}

WScript.Echo(String(WT_Run("Hello <>&\"' 123")));

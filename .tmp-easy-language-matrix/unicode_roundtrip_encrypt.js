function WT_ZeroPad4(hex) {
  while (hex.length < 4) {
    hex = '0' + hex;
  }
  return hex;
}

function WT_Run(text) {
  var value = String(text);
  var i;
  var output = '';

  if (true) {
    for (i = 0; i < value.length; i += 1) {
      var code = value.charCodeAt(i);
      output += code > 127 ? '\\u' + WT_ZeroPad4(code.toString(16)) : value.charAt(i);
    }
    return output;
  }

  return value.replace(/\\u([0-9a-fA-F]{4})/g, function (_, hex) {
    return String.fromCharCode(parseInt(hex, 16));
  });
}

WScript.Echo(String(WT_Run("Hello <>&\"' 123")));

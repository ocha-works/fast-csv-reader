// solve.js — a fast drop-in replacement for csv-reader 1.0.0.
//
// run(input) returns, for an input {text, header}, exactly the answer csv-reader 1.0.0 returns:
// {columns, rows, errors}, under csv-reader's own broken-row policy:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled ("" inside it is
//     one quote; each CRLF or lone CR inside it reads as LF); what follows its closing quote, up
//     to the next comma or line break, is appended as it stands (quote_junk, when anything was
//     appended); a quote that never closes is a literal character and the text after it is read
//     again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay strings, never
//     trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds the records after
//     it (every record when header is false), each padded with "" (short_row) or cut (long_row)
//     to the first record's width;
//   - each error is {code, line, row} in the order met: line the 1-based line its record starts
//     on (every LF, CRLF and lone CR inside quotes counted), row its record's index in rows,
//     null for the header.
//
// csv-reader builds every field a character at a time. This reader reaches the same answers by
// scanning: an unquoted field is one tight loop over code units up to the next comma, LF or CR,
// and its value is one slice of the text; a quoted field finds its closing quote with indexOf,
// counts the lines inside it in one pass, and only rebuilds its value when it holds an escaped
// quote or a CR. Nothing is kept from one call to the next.

// How a field ended.
const COMMA = 0; // at a comma: the record goes on
const BREAK = 1; // at a line break: the record ends
const EOF = 2; // at the end of the text: the record ends

/**
 * csv-reader 1.0.0's answer for one case's input, computed by scanning.
 * @param {{text: unknown, header: unknown}} input
 * @returns {{columns: string[] | null, rows: string[][], errors: object[]}}
 */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next code unit to read
  let line = 1; // the line that code unit is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: header).
  let recordLine = 1;
  let recordRow = null;

  // The field most recently read, handed back through these three: its value, how it ended,
  // and how many characters the read itself kept (a quoted field's junk count).
  let fValue = '';
  let fEnded = EOF;
  let fAdded = 0;

  // Reads unquoted characters onto `init` up to the next comma or line break. A CR not followed
  // by LF is dropped (stray_cr); the kept text either side of one is joined from slices.
  function readUnquoted(init) {
    let segStart = pos;
    let i = pos;
    let parts = null; // slices kept either side of dropped CRs, once one is met
    let added = 0;
    for (;;) {
      while (i < n) {
        const c = text.charCodeAt(i);
        if (c === 44 || c === 10 || c === 13) break;
        i += 1;
      }
      if (i >= n) {
        fAdded = added + (n - segStart);
        fValue =
          parts === null
            ? init === ''
              ? text.slice(segStart, n)
              : init + text.slice(segStart, n)
            : init + parts.join('') + text.slice(segStart, n);
        fEnded = EOF;
        pos = n;
        return;
      }
      const c = text.charCodeAt(i);
      if (c === 13 && text.charCodeAt(i + 1) !== 10) {
        if (parts === null) parts = [];
        parts.push(text.slice(segStart, i));
        added += i - segStart;
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        i += 1;
        segStart = i;
        continue;
      }
      fAdded = added + (i - segStart);
      fValue =
        parts === null
          ? init === ''
            ? text.slice(segStart, i)
            : init + text.slice(segStart, i)
          : init + parts.join('') + text.slice(segStart, i);
      if (c === 44) {
        fEnded = COMMA;
        pos = i + 1;
      } else {
        line += 1;
        fEnded = BREAK;
        pos = c === 10 ? i + 1 : i + 2;
      }
      return;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    // The closing quote is the first '"' that is not doubled; indexOf finds the candidates.
    let i = open + 1;
    let close = -1;
    let escaped = false;
    while (i < n) {
      const q = text.indexOf('"', i);
      if (q === -1) break;
      if (text.charCodeAt(q + 1) === 34) {
        escaped = true;
        i = q + 2;
        continue;
      }
      close = q;
      break;
    }
    if (close === -1) {
      // The quote never closes: it is a literal character, and the text after it is read again
      // as unquoted, from the line the quote opened on.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      readUnquoted('"');
      return;
    }
    const from = open + 1;
    let value = text.slice(from, close);
    // Every CR (with the LF of a CRLF) and every lone LF inside the quotes counts one line,
    // and a CR inside reads as LF in the value.
    let hasCR = false;
    for (let j = from; j < close; j += 1) {
      const c = text.charCodeAt(j);
      if (c === 13) {
        hasCR = true;
        line += 1;
        if (text.charCodeAt(j + 1) === 10) j += 1;
      } else if (c === 10) {
        line += 1;
      }
    }
    if (hasCR) value = value.replace(/\r\n?/g, '\n');
    if (escaped) value = value.replace(/""/g, '"');
    pos = close + 1;
    if (pos >= n) {
      fValue = value;
      fEnded = EOF;
      return;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fValue = value;
      fEnded = COMMA;
      return;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fValue = value;
      fEnded = BREAK;
      return;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fValue = value;
      fEnded = BREAK;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the next comma or break.
    readUnquoted(value);
    if (fAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) {
        readQuoted();
        fields.push(fValue);
      } else {
        // The common field, read inline: unquoted text up to the next comma or line break.
        let segStart = pos;
        let i = pos;
        let parts = null;
        let value = '';
        for (;;) {
          while (i < n) {
            const c = text.charCodeAt(i);
            if (c === 44 || c === 10 || c === 13) break;
            i += 1;
          }
          if (i >= n) {
            value = parts === null ? text.slice(segStart, n) : parts.join('') + text.slice(segStart, n);
            fEnded = EOF;
            pos = n;
            break;
          }
          const c = text.charCodeAt(i);
          if (c === 13 && text.charCodeAt(i + 1) !== 10) {
            if (parts === null) parts = [];
            parts.push(text.slice(segStart, i));
            errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            i += 1;
            segStart = i;
            continue;
          }
          value = parts === null ? text.slice(segStart, i) : parts.join('') + text.slice(segStart, i);
          if (c === 44) {
            fEnded = COMMA;
            pos = i + 1;
          } else {
            line += 1;
            fEnded = BREAK;
            pos = c === 10 ? i + 1 : i + 2;
          }
          break;
        }
        fields.push(value);
      }
    } while (fEnded === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}

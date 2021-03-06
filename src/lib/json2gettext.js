const GettextParser = require('gettext-parser');
const Promise = require('bluebird');

const plurals = require('./plurals');
const { flatten } = require('./flatten');

function i18nextToPo(domain, body, options = {}) {
  return i18nextToGettext(domain, body, GettextParser.po, identity, options);
}

function i18nextToPot(domain, body, options = {}) {
  return i18nextToGettext(domain, body, GettextParser.po, () => '', options);
}

function i18nextToMo(domain, body, options = {}) {
  return i18nextToGettext(domain, body, GettextParser.mo, identity, options);
}

function i18nextToGettext(domain, body, parser, getTranslatedValue, options = {}) {
  return Promise.resolve(flatten(JSON.parse(body), options))
    .then((flat) => {
      if (options.base) {
        const bflat = flatten(JSON.parse(options.base), options);
        Object.keys(bflat).forEach((key) => {
          if (flat[key]) {
            if (flat[key].plurals) {
              bflat[key].translated_value = getTranslatedValue(getPluralArray(domain, flat[key]));
            } else {
              bflat[key].translated_value = getTranslatedValue(flat[key].value);
            }
          }
        });

        return parseGettext(domain, bflat, options);
      }

      return parseGettext(domain, flat, options);
    })
    .then(data => parser.compile(data));
}

function getPluralArray(domain, translation) {
  const ext = plurals.rules[domain.replace('_', '-').split('-')[0]];
  const pArray = [];

  for (let i = 0, len = translation.plurals.length; i < len; i += 1) {
    const plural = translation.plurals[i];
    pArray.splice(getGettextPluralPosition(ext, plural.pluralNumber - 1), 0, plural.value);
  }
  pArray.splice(getGettextPluralPosition(ext, translation.pluralNumber - 1), 0, translation.value);

  return pArray;
}

/*
 * flat json --> gettext
 */
function parseGettext(domain, data, options = {}) {
  const out = {
    charset: 'utf-8',
    headers: {
      'project-id-version': options.project || 'i18next-conv',
      'mime-version': '1.0',
      'content-type': 'text/plain; charset=utf-8',
      'content-transfer-encoding': '8bit',
    },
    translations: {},
  };

  const ext = plurals.rules[domain.replace('_', '-').split('-')[0]];
  const trans = {};

  out.headers['plural-forms'] =
    `nplurals=${ext.nplurals}; ` +
    `plural=${ext.plurals}`;

  if (!options.noDate) {
    out.headers['pot-creation-date'] = new Date().toISOString();
    out.headers['po-revision-date'] = new Date().toISOString();
  }
  if (options.language) {
    out.headers.language = options.language;
  }
  const delkeys = [];

  Object.keys(data).forEach((m) => {
    const kv = data[m];

    if (kv.plurals) {
      const pArray = [];

      for (let i = 0, len = kv.plurals.length; i < len; i += 1) {
        const plural = kv.plurals[i];
        pArray.splice(getGettextPluralPosition(ext, plural.pluralNumber - 1), 0, plural.value);
      }
      pArray.splice(getGettextPluralPosition(ext, kv.pluralNumber - 1), 0, kv.value);

      if (typeof trans[kv.context] !== 'object') trans[kv.context] = {};
      if (options.keyasareference) {
        if (typeof trans[kv.context][kv.value] === 'object') {
          // same context and msgid. this could theorically be merged.
          trans[kv.context][kv.value].comments.reference.push(kv.key);
        } else {
          trans[kv.context][kv.value] = {
            msgctxt: kv.context,
            msgid: pArray[0],
            msgid_plural: pArray.slice(1, pArray.length),
            msgstr: kv.translated_value,
            comments: { reference: [kv.key] },
          };
        }
        if (kv.key !== kv.value) {
          delkeys.push([kv.context, kv.key]);
        }
      } else {
        trans[kv.context][kv.key] = {
          msgctxt: kv.context,
          msgid: kv.key,
          msgid_plural: kv.key,
          msgstr: pArray,
        };
      }
    } else {
      if (typeof trans[kv.context] !== 'object') trans[kv.context] = {};

      if (options.keyasareference) {
        if (typeof trans[kv.context][kv.value] === 'object') {
          // same context and msgid. this could theorically be merged.
          trans[kv.context][kv.value].comments.reference.push(kv.key);
        } else {
          trans[kv.context][kv.value] = {
            msgctxt: kv.context,
            msgid: kv.value,
            msgstr: kv.translated_value,
            comments: {
              reference: [kv.key],
            },
          };
        }
        if (kv.key !== kv.value) {
          delkeys.push([kv.context, kv.key]);
        }
      } else {
        trans[kv.context][kv.key] = { msgctxt: kv.context, msgid: kv.key, msgstr: kv.value };
      }
    }
  });

  delkeys.forEach((a) => {
    const c = a[0];
    const k = a[1];
    delete trans[c][k];
  });

  // re-format reference comments to be able to compile with gettext-parser...
  Object.keys(trans).forEach((ctxt) => {
    Object.keys(trans[ctxt]).forEach((id) => {
      if (trans[ctxt][id].comments && trans[ctxt][id].comments.reference) {
        trans[ctxt][id].comments.reference = trans[ctxt][id].comments.reference.join('\n');
      }
    });
  });

  out.translations = trans;
  return Promise.resolve(out);
}

/*
 * helper to get plural suffix
 */
function getGettextPluralPosition(ext, suffix) {
  if (ext) {
    for (let i = 0; i < ext.nplurals; i += 1) {
      if (i === suffix) {
        return i;
      }
    }
  }

  return -1;
}

function identity(val) {
  return val;
}

module.exports = {
  i18nextToPot,
  i18nextToPo,
  i18nextToMo,
};

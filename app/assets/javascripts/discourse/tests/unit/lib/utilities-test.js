import {
  caretRowCol,
  clipboardCopyAsync,
  defaultHomepage,
  emailValid,
  escapeExpression,
  extractDomainFromUrl,
  fillMissingDates,
  inCodeBlock,
  initializeDefaultHomepage,
  mergeSortedLists,
  modKeysPressed,
  setCaretPosition,
  setDefaultHomepage,
  slugify,
  toAsciiPrintable,
} from "discourse/lib/utilities";
import sinon from "sinon";
import { module, test } from "qunit";
import Handlebars from "handlebars";
import { chromeTest } from "discourse/tests/helpers/qunit-helpers";
import { setupRenderingTest } from "discourse/tests/helpers/component-test";
import { click, render } from "@ember/test-helpers";
import { hbs } from "ember-cli-htmlbars";
import { setupTest } from "ember-qunit";
import { getOwner } from "@ember/application";

module("Unit | Utilities", function (hooks) {
  setupTest(hooks);

  test("escapeExpression", function (assert) {
    assert.strictEqual(
      escapeExpression(">"),
      "&gt;",
      "escapes unsafe characters"
    );

    assert.strictEqual(
      escapeExpression(new Handlebars.SafeString("&gt;")),
      "&gt;",
      "does not double-escape safe strings"
    );

    assert.strictEqual(
      escapeExpression(undefined),
      "",
      "returns a falsy string when given a falsy value"
    );
  });

  test("emailValid", function (assert) {
    assert.ok(
      emailValid("Bob@example.com"),
      "allows upper case in the first part of emails"
    );
    assert.ok(
      emailValid("bob@EXAMPLE.com"),
      "allows upper case in the email domain"
    );
  });

  test("extractDomainFromUrl", function (assert) {
    assert.strictEqual(
      extractDomainFromUrl("http://meta.discourse.org:443/random"),
      "meta.discourse.org",
      "extract domain name from url"
    );
    assert.strictEqual(
      extractDomainFromUrl("meta.discourse.org:443/random"),
      "meta.discourse.org",
      "extract domain regardless of scheme presence"
    );
    assert.strictEqual(
      extractDomainFromUrl("http://192.168.0.1:443/random"),
      "192.168.0.1",
      "works for IP address"
    );
    assert.strictEqual(
      extractDomainFromUrl("http://localhost:443/random"),
      "localhost",
      "works for localhost"
    );
  });

  test("defaultHomepage via meta tag", function (assert) {
    let meta = document.createElement("meta");
    meta.name = "discourse_current_homepage";
    meta.content = "hot";
    document.body.appendChild(meta);

    const siteSettings = getOwner(this).lookup("service:site-settings");
    initializeDefaultHomepage(siteSettings);

    assert.strictEqual(
      defaultHomepage(),
      "hot",
      "default homepage is pulled from <meta name=discourse_current_homepage>"
    );
    document.body.removeChild(meta);
  });

  test("defaultHomepage via site settings", function (assert) {
    const siteSettings = getOwner(this).lookup("service:site-settings");
    siteSettings.top_menu = "top|latest|hot";
    initializeDefaultHomepage(siteSettings);

    assert.strictEqual(
      defaultHomepage(),
      "top",
      "default homepage is the first item in the top_menu site setting"
    );
  });

  test("setDefaultHomepage", function (assert) {
    const siteSettings = getOwner(this).lookup("service:site-settings");
    initializeDefaultHomepage(siteSettings);

    assert.strictEqual(defaultHomepage(), "latest");

    setDefaultHomepage("top");
    assert.strictEqual(defaultHomepage(), "top");
  });

  test("caretRowCol", function (assert) {
    let textarea = document.createElement("textarea");
    const content = document.createTextNode("01234\n56789\n012345");
    textarea.appendChild(content);
    document.body.appendChild(textarea);

    const assertResult = (setCaretPos, expectedRowNum, expectedColNum) => {
      setCaretPosition(textarea, setCaretPos);

      const result = caretRowCol(textarea);
      assert.strictEqual(
        result.rowNum,
        expectedRowNum,
        "returns the right row of the caret"
      );
      assert.strictEqual(
        result.colNum,
        expectedColNum,
        "returns the right col of the caret"
      );
    };

    assertResult(0, 1, 0);
    assertResult(5, 1, 5);
    assertResult(6, 2, 0);
    assertResult(11, 2, 5);
    assertResult(14, 3, 2);

    document.body.removeChild(textarea);
  });

  test("toAsciiPrintable", function (assert) {
    const accentedString = "Créme_Brûlée!";
    const unicodeString = "談話";

    assert.strictEqual(
      toAsciiPrintable(accentedString, "discourse"),
      "Creme_Brulee!",
      "it replaces accented characters with the appropriate ASCII equivalent"
    );

    assert.strictEqual(
      toAsciiPrintable(unicodeString, "discourse"),
      "discourse",
      "it uses the fallback string when unable to convert"
    );

    assert.strictEqual(
      typeof toAsciiPrintable(unicodeString),
      "undefined",
      "it returns undefined when unable to convert and no fallback is provided"
    );
  });

  test("slugify", function (assert) {
    const asciiString = "--- 0__( Some-cool Discourse Site! )__0 --- ";
    const accentedString = "Créme_Brûlée!";
    const unicodeString = "談話";

    assert.strictEqual(
      slugify(asciiString),
      "0-some-cool-discourse-site-0",
      "it properly slugifies an ASCII string"
    );

    assert.strictEqual(
      slugify(accentedString),
      "crme-brle",
      "it removes accented characters"
    );

    assert.strictEqual(
      slugify(unicodeString),
      "",
      "it removes unicode characters"
    );
  });

  test("fillMissingDates", function (assert) {
    const startDate = "2017-11-12"; // YYYY-MM-DD
    const endDate = "2017-12-12"; // YYYY-MM-DD
    const data =
      '[{"x":"2017-11-12","y":3},{"x":"2017-11-27","y":2},{"x":"2017-12-06","y":9},{"x":"2017-12-11","y":2}]';

    assert.strictEqual(
      fillMissingDates(JSON.parse(data), startDate, endDate).length,
      31,
      "it returns a JSON array with 31 dates"
    );
  });

  test("inCodeBlock", function (assert) {
    const texts = [
      // CLOSED CODE BLOCKS:
      "000\n\n    111\n\n000",
      "000 `111` 000",
      "000\n```\n111\n```\n000",
      "000\n[code]111[/code]\n000",
      // OPEN CODE BLOCKS:
      "000\n\n    111",
      "000 `111",
      "000\n```\n111",
      "000\n[code]111",
      // COMPLEX TEST:
      "000\n\n```\n111\n```\n\n000\n\n`111 111`\n\n000\n\n[code]\n111\n[/code]\n\n    111\n\t111\n\n000`111",
      // INDENTED OPEN CODE BLOCKS:
      // - Using tab
      "000\n\t```111\n\t111\n\t111```\n000",
      // - Using spaces
      `000\n  \`\`\`111\n  111\n  111\`\`\`\n000`,
    ];

    texts.forEach((text) => {
      for (let i = 0; i < text.length; ++i) {
        if (text[i] === "0" || text[i] === "1") {
          assert.strictEqual(inCodeBlock(text, i), text[i] === "1");
        }
      }
    });
  });

  test("mergeSortedLists", function (assert) {
    const comparator = (a, b) => b > a;
    assert.deepEqual(
      mergeSortedLists([], [1, 2, 3], comparator),
      [1, 2, 3],
      "it doesn't error when the first list is blank"
    );
    assert.deepEqual(
      mergeSortedLists([3, 2, 1], [], comparator),
      [3, 2, 1],
      "it doesn't error when the second list is blank"
    );
    assert.deepEqual(
      mergeSortedLists([], [], comparator),
      [],
      "it doesn't error when the both lists are blank"
    );
    assert.deepEqual(
      mergeSortedLists([5, 4, 0, -1], [1], comparator),
      [5, 4, 1, 0, -1],
      "it correctly merges lists when one list has 1 item only"
    );
    assert.deepEqual(
      mergeSortedLists([2], [1], comparator),
      [2, 1],
      "it correctly merges lists when both lists has 1 item each"
    );
    assert.deepEqual(
      mergeSortedLists([1], [1], comparator),
      [1, 1],
      "it correctly merges lists when both lists has 1 item and their items are identical"
    );
    assert.deepEqual(
      mergeSortedLists([5, 4, 3, 2, 1], [6, 2, 1], comparator),
      [6, 5, 4, 3, 2, 2, 1, 1],
      "it correctly merges lists that share common items"
    );
  });
});

module("Unit | Utilities | modKeysPressed", function (hooks) {
  setupRenderingTest(hooks);

  test("returns an array of modifier keys pressed during keyboard or mouse event", async function (assert) {
    let i = 0;

    this.handleClick = (event) => {
      if (i === 0) {
        assert.deepEqual(modKeysPressed(event), []);
      } else if (i === 1) {
        assert.deepEqual(modKeysPressed(event), ["alt"]);
      } else if (i === 2) {
        assert.deepEqual(modKeysPressed(event), ["shift"]);
      } else if (i === 3) {
        assert.deepEqual(modKeysPressed(event), ["meta"]);
      } else if (i === 4) {
        assert.deepEqual(modKeysPressed(event), ["ctrl"]);
      } else if (i === 5) {
        assert.deepEqual(modKeysPressed(event), [
          "alt",
          "shift",
          "meta",
          "ctrl",
        ]);
      }
    };

    await render(hbs`<button id="btn" {{on "click" this.handleClick}} />`);

    await click("#btn");
    i++;
    await click("#btn", { altKey: true });
    i++;
    await click("#btn", { shiftKey: true });
    i++;
    await click("#btn", { metaKey: true });
    i++;
    await click("#btn", { ctrlKey: true });
    i++;
    await click("#btn", {
      altKey: true,
      shiftKey: true,
      metaKey: true,
      ctrlKey: true,
    });
  });
});

module("Unit | Utilities | clipboard", function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.mockClipboard = {
      writeText: sinon.stub().resolves(true),
      write: sinon.stub().resolves(true),
    };
    sinon.stub(window.navigator, "clipboard").get(() => this.mockClipboard);
  });

  async function asyncFunction() {
    return new Blob(["some text to copy"], {
      type: "text/plain",
    });
  }

  test("clipboardCopyAsync - browser does not support window.ClipboardItem", async function (assert) {
    // without this check the stubbing will fail on Firefox
    if (window.ClipboardItem) {
      sinon.stub(window, "ClipboardItem").value(null);
    }

    await clipboardCopyAsync(asyncFunction);
    assert.strictEqual(
      this.mockClipboard.writeText.calledWith("some text to copy"),
      true,
      "it writes to the clipboard using writeText instead of write"
    );
  });

  chromeTest(
    "clipboardCopyAsync - browser does support window.ClipboardItem",
    async function (assert) {
      await clipboardCopyAsync(asyncFunction);
      assert.strictEqual(
        this.mockClipboard.write.called,
        true,
        "it writes to the clipboard using write"
      );
    }
  );
});

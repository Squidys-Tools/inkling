import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { purifyHtml } from "./purifyHtml";

const { window } = new JSDOM("");
const pageUrl = "https://example.com/articles/first";
const purify = (html: string) => purifyHtml(window, html, pageUrl);

describe("purifyHtml", () => {
  test("keeps article markup and resolves its links against the page", () => {
    expect(
      purify(
        '<h2>Heading</h2><p>Read <a href="/next" target="_blank">on</a> <em>now</em>.</p>' +
          '<figure><img src="photo.jpg" alt="A photo"><figcaption>Caption</figcaption></figure>' +
          "<ul><li>One</li></ul><blockquote><p>Quoted</p></blockquote>",
      ),
    ).toBe(
      '<h2>Heading</h2><p>Read <a href="https://example.com/next" target="_blank">on</a> <em>now</em>.</p>' +
        '<figure><img src="https://example.com/articles/photo.jpg" alt="A photo"><figcaption>Caption</figcaption></figure>' +
        "<ul><li>One</li></ul><blockquote><p>Quoted</p></blockquote>",
    );
  });

  test("keeps the X embed markup the widget upgrades", () => {
    const embed =
      '<blockquote class="twitter-tweet" data-dnt="true"><p lang="en">just setting up my twttr</p>' +
      '— jack <a href="https://twitter.com/jack/status/20">March 21, 2006</a></blockquote>';
    expect(purify(embed)).toBe(embed);
  });

  test("rebuilds an allowlisted iframe on the provider's embed URL", () => {
    expect(
      purify(
        '<iframe src="https://www.youtube.com/watch?v=abc12345678" title="Video" allow="camera" allowfullscreen srcdoc="<script>alert(1)</script>"></iframe>',
      ),
    ).toBe(
      '<iframe src="https://www.youtube-nocookie.com/embed/abc12345678" title="Video" loading="lazy" referrerpolicy="no-referrer"></iframe>',
    );
  });

  test("keeps direct media only as a media file", () => {
    expect(
      purify(
        '<video controls src="https://example.com/not-a-video"><source src="/clip.mp4" type="video/mp4"><source src="https://www.youtube.com/watch?v=abc12345678"></video>',
      ),
    ).toBe(
      '<video controls=""><source src="https://example.com/clip.mp4" type="video/mp4"></video>',
    );
  });

  test.each([
    ["script", "<p>Hi</p><script>alert(1)</script>", "<p>Hi</p>"],
    [
      "event handlers",
      '<p onclick="evil()">Hi</p><img src="a.jpg" onerror="evil()">',
      '<p>Hi</p><img src="https://example.com/articles/a.jpg">',
    ],
    [
      "javascript: links",
      '<a href="javascript:alert(1)">x</a><a href=" JaVaScRiPt:alert(1)">y</a>',
      "<a>x</a><a>y</a>",
    ],
    [
      "data: and file: URLs",
      '<img src="data:image/png;base64,AAAA"><a href="file:///etc/passwd">f</a>',
      "<img><a>f</a>",
    ],
    [
      "base",
      '<base href="https://evil.example/"><a href="/x">x</a>',
      '<a href="https://example.com/x">x</a>',
    ],
    [
      "iframes off the allowlist",
      '<iframe src="https://evil.example/embed"></iframe><iframe src="javascript:alert(1)"></iframe><iframe srcdoc="<script>alert(1)</script>"></iframe>',
      "",
    ],
    [
      "forms, styles and templates",
      '<form action="https://evil.example/"><input name="q"></form><style>p{}</style><template><p>t</p></template><p style="color:red">k</p>',
      "<p>k</p>",
    ],
    [
      "objects and embeds",
      '<object data="https://evil.example/x.swf"></object><embed src="https://evil.example/x.swf">',
      "",
    ],
  ])("strips %s", (_name, html, expected) => {
    expect(purify(html)).toBe(expected);
  });

  test.each([
    '<svg><script>alert(1)</script><a xlink:href="javascript:alert(1)"><text>t</text></a></svg>',
    '<svg><use href="data:image/svg+xml,&lt;svg id=&quot;x&quot; xmlns=&quot;http://www.w3.org/2000/svg&quot;&gt;&lt;image href=&quot;1&quot; onerror=&quot;alert(1)&quot; /&gt;&lt;/svg&gt;#x"></use></svg>',
    '<svg><animate onbegin="alert(1)" attributeName="x"></animate><set attributeName="href" to="javascript:alert(1)"></set></svg>',
    "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>",
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
  ])("leaves nothing executable in %s", (html) => {
    const container = window.document.createElement("div");
    container.innerHTML = purify(html);
    for (const element of container.querySelectorAll("*")) {
      expect(["script", "set", "animate", "noscript"]).not.toContain(element.localName);
      for (const attribute of element.attributes) {
        expect(attribute.name).not.toStartWith("on");
        expect(attribute.value.toLowerCase()).not.toContain("javascript:");
        expect(attribute.value.toLowerCase()).not.toContain("data:");
      }
    }
  });
});

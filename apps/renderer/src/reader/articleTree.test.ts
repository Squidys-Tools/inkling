import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { parseHTML } from "linkedom";
import { type ArticleNode, articleTree } from "./articleTree.ts";

const { window } = new JSDOM("");
const pageUrl = "https://example.com/articles/first";
const tree = (html: string) => articleTree(window, html, pageUrl);

// Prints a tree as markup, with props in a fixed order, so expectations read like HTML.
function markup(nodes: ArticleNode[]): string {
  return nodes
    .map((node) => {
      if (typeof node === "string") return node;
      const props = Object.entries(node.props)
        .filter(([, value]) => value !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, value]) => ` ${name}=${JSON.stringify(value)}`)
        .join("");
      return `<${node.tag}${props}${node.lede ? " lede" : ""}>${markup(node.children)}</${node.tag}>`;
    })
    .join("");
}
const render = (html: string) => markup(tree(html));

describe("articleTree", () => {
  test("keeps article markup and resolves its links against the page", () => {
    expect(
      render(
        '<h2>Heading</h2><p>Read <a href="/next" target="_blank">on</a> <em>now</em>.</p>' +
          '<figure><img src="photo.jpg" alt="A photo"><figcaption>Caption</figcaption></figure>' +
          "<ul>\n<li>One</li>\n</ul><blockquote><p>Quoted</p></blockquote>",
      ),
    ).toBe(
      '<h2>Heading</h2><p>Read <a href="https://example.com/next">on</a> <em>now</em>.</p>' +
        '<figure><img alt="A photo" decoding="async" loading="lazy" src="https://example.com/articles/photo.jpg"></img><figcaption>Caption</figcaption></figure>' +
        "<ul><li>One</li></ul><blockquote><p>Quoted</p></blockquote>",
    );
  });

  test("marks the lede and keeps no other class", () => {
    expect(
      render('<p class="article-lede fixed inset-0">Lede</p><div class="fixed">Body</div>'),
    ).toBe("<p lede>Lede</p><div>Body</div>");
  });

  test("rebuilds an allowlisted iframe on the provider's embed URL", () => {
    expect(
      render(
        '<iframe src="https://www.youtube.com/watch?v=abc12345678" title="Video" allow="camera" allowfullscreen name="f" sandbox="allow-scripts"></iframe>',
      ),
    ).toBe(
      '<iframe loading="lazy" referrerPolicy="strict-origin-when-cross-origin" src="https://www.youtube-nocookie.com/embed/abc12345678" title="Video"></iframe>',
    );
  });

  test("keeps direct media only as a media file, with controls", () => {
    expect(
      render(
        '<video autoplay src="https://example.com/not-a-video"><source src="/clip.mp4" type="video/mp4"><source src="https://www.youtube.com/watch?v=abc12345678"></video>' +
          "<video>\n</video>",
      ),
    ).toBe(
      '<video controls=true preload="none"><source src="https://example.com/clip.mp4" type="video/mp4"></source></video>',
    );
  });

  test("keeps table structure, spans and list numbering but not stray whitespace", () => {
    expect(
      render(
        '<ol start="3" reversed><li value="5">x</li></ol><table>\n<tbody>\n<tr>\n<td colspan="2" rowspan="x">c</td>\n</tr>\n</tbody>\n</table>',
      ),
    ).toBe(
      "<ol reversed=true start=3><li value=5>x</li></ol><table><tbody><tr><td colSpan=2>c</td></tr></tbody></table>",
    );
  });

  test("unwraps unknown elements and keeps their text", () => {
    expect(render("<p><x-note>kept</x-note> <font color=red>text</font></p>")).toBe(
      "<p>kept text</p>",
    );
  });

  test.each([
    ["script", "<p>Hi</p><script>alert(1)</script>", "<p>Hi</p>"],
    [
      "event handlers",
      '<p onclick="evil()">Hi</p><img src="a.jpg" onerror="evil()">',
      '<p>Hi</p><img decoding="async" loading="lazy" src="https://example.com/articles/a.jpg"></img>',
    ],
    [
      "javascript: links",
      '<a href="javascript:alert(1)">x</a><a href=" JaVaScRiPt:alert(1)">y</a>',
      "<a>x</a><a>y</a>",
    ],
    [
      "data: and file: URLs, and images with nothing to show",
      '<img src="data:image/png;base64,AAAA"><a href="file:///etc/passwd">f</a>',
      "<a>f</a>",
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
      "forms, styles, templates and inline styles",
      '<form action="https://evil.example/"><input name="q"></form><style>p{}</style><template><p>t</p></template><p style="color:red">k</p>',
      "<p>k</p>",
    ],
    [
      "targets and ids",
      '<a href="/a" target="_top" id="x" name="y">a</a>',
      '<a href="https://example.com/a">a</a>',
    ],
    [
      "popovers and buttons",
      '<div popover id="p">over</div><button popovertarget="p">open</button>',
      "<div>over</div>",
    ],
    [
      "objects, embeds, SVG and MathML",
      '<object data="https://evil.example/x.swf"></object><embed src="https://evil.example/x.swf"><svg><a xlink:href="javascript:alert(1)"><text>t</text></a></svg><math><mi>x</mi></math>',
      "",
    ],
    [
      "srcset",
      '<img src="a.jpg" srcset="https://evil.example/b.jpg 2x">',
      '<img decoding="async" loading="lazy" src="https://example.com/articles/a.jpg"></img>',
    ],
  ])("strips %s", (_name, html, expected) => {
    expect(render(html)).toBe(expected);
  });

  test.each([
    "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>",
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
    '<svg><animate onbegin="alert(1)" attributeName="x"></animate></svg><a href="javascript:alert(1)">x</a>',
  ])("leaves nothing executable in %s", (html) => {
    const visit = (nodes: ArticleNode[]) => {
      for (const node of nodes) {
        if (typeof node === "string") continue;
        for (const [name, value] of Object.entries(node.props)) {
          expect(name.toLowerCase()).not.toStartWith("on");
          expect(String(value).toLowerCase()).not.toContain("javascript:");
          expect(String(value).toLowerCase()).not.toContain("data:");
        }
        visit(node.children);
      }
    };
    visit(tree(html));
  });

  test("refuses a DOM DOMPurify cannot trust", () => {
    const { window: linkedomWindow } = parseHTML("<html><body></body></html>");
    expect(() => articleTree(linkedomWindow, "<p>x</p>", pageUrl)).toThrow();
  });
});

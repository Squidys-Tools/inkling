import { expect, test } from "bun:test";
import { cleanCapturedHtml } from "./captured-html.ts";

const pageUrl = "https://example.com/articles/first";

test("keeps article markup with links and media resolved against the page", () => {
  expect(
    cleanCapturedHtml(
      '<p>Read <a href="/next">on</a>.</p><noscript><img src="photo.jpg"></noscript>' +
        '<iframe src="https://www.youtube.com/watch?v=abc12345678" allowfullscreen></iframe>' +
        '<video><source src="clip.mp4"></video>',
      pageUrl,
    ),
  ).toBe(
    '<p>Read <a href="https://example.com/next">on</a>.</p><img src="https://example.com/articles/photo.jpg">' +
      '<iframe referrerpolicy="no-referrer" loading="lazy" src="https://www.youtube-nocookie.com/embed/abc12345678"></iframe>' +
      '<video><source src="https://example.com/articles/clip.mp4"></video>',
  );
});

test("leaves scripts, handlers and unsafe embeds out of stored HTML", () => {
  expect(
    cleanCapturedHtml(
      '<p onclick="evil()" style="color:red">Hi</p><script>alert(1)</script><style>p{}</style>' +
        '<form><input></form><a href="javascript:alert(1)">x</a><img src="a.jpg" srcset="b.jpg 2x">' +
        '<iframe src="https://evil.example/x"></iframe><iframe srcdoc="<script></script>" src="https://youtu.be/abc12345678"></iframe>' +
        '<video src="https://example.com/not-a-video"></video>',
      pageUrl,
    ),
  ).toBe(
    '<p>Hi</p><a>x</a><img src="https://example.com/articles/a.jpg">' +
      '<iframe referrerpolicy="no-referrer" loading="lazy" src="https://www.youtube-nocookie.com/embed/abc12345678"></iframe>' +
      "<video></video>",
  );
});

export default function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy({
    "src/data/scenarios.json": "data/scenarios.json",
  });
}

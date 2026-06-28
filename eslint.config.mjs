import nextConfig from "eslint-config-next/core-web-vitals";
import prettierConfig from "eslint-config-prettier";

const config = [
  ...nextConfig,
  prettierConfig,
  {
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "TaggedTemplateExpression[tag.name='sql']",
          message:
            "Use parameterized queries (pool.query(sql, [params])) instead of tagged template SQL literals to prevent SQL injection.",
        },
        {
          selector: "CallExpression[callee.property.name='query'] > TemplateLiteral:first-child",
          message:
            "Avoid template literals as the first argument to pool.query(). Use a plain string with $1/$2 placeholders and a params array to prevent SQL injection.",
        },
      ],
    },
  },
];

export default config;

# ─── CloudFront CDN for Next.js static assets ────────────────────────────────

locals {
  s3_origin_id  = "lumigift-${var.env}-alb"
  static_path   = "/_next/static/*"
  image_path    = "/_next/image*"
}

# Cache policy: 1 year immutable for static assets
resource "aws_cloudfront_cache_policy" "static_assets" {
  name        = "lumigift-${var.env}-static-assets"
  min_ttl     = 31536000
  default_ttl = 31536000
  max_ttl     = 31536000

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config { cookie_behavior = "none" }
    headers_config  { header_behavior = "none" }
    query_strings_config { query_string_behavior = "none" }
  }
}

# Cache policy: no-cache for HTML pages (always revalidate)
resource "aws_cloudfront_cache_policy" "html_no_cache" {
  name        = "lumigift-${var.env}-html-no-cache"
  min_ttl     = 0
  default_ttl = 0
  max_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config { cookie_behavior = "none" }
    headers_config  { header_behavior = "none" }
    query_strings_config { query_string_behavior = "none" }
  }
}

# Cache policy: 7 days for Next.js image optimizations
resource "aws_cloudfront_cache_policy" "image_cache" {
  name        = "lumigift-${var.env}-image-cache"
  min_ttl     = 0
  default_ttl = 604800
  max_ttl     = 604800

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config { cookie_behavior = "none" }
    headers_config  { header_behavior = "none" }
    query_strings_config {
      query_string_behavior = "whitelist"
      query_strings { items = ["url", "w", "q"] }
    }
  }
}

resource "aws_cloudfront_distribution" "app" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "lumigift-${var.env}"
  aliases             = var.env == "prod" ? [var.domain_name, "cdn.${var.domain_name}"] : ["cdn.${var.env}.${var.domain_name}"]
  http_version        = "http2and3"
  price_class         = "PriceClass_100"

  origin {
    domain_name = aws_alb.main.dns_name
    origin_id   = local.s3_origin_id

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # /_next/static/* — 1 year immutable
  ordered_cache_behavior {
    path_pattern           = local.static_path
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = local.s3_origin_id
    cache_policy_id        = aws_cloudfront_cache_policy.static_assets.id
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    function_association {
      event_type   = "viewer-response"
      function_arn = aws_cloudfront_function.static_cache_headers.arn
    }
  }

  # /_next/image* — 7 day cache
  ordered_cache_behavior {
    path_pattern           = local.image_path
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = local.s3_origin_id
    cache_policy_id        = aws_cloudfront_cache_policy.image_cache.id
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
  }

  # Default — HTML: no-cache
  default_cache_behavior {
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = local.s3_origin_id
    cache_policy_id        = aws_cloudfront_cache_policy.html_no_cache.id
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    function_association {
      event_type   = "viewer-response"
      function_arn = aws_cloudfront_function.html_no_cache_headers.arn
    }
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    acm_certificate_arn      = var.acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = local.tags
}

# CloudFront Function: Cache-Control: max-age=31536000, immutable for static assets
resource "aws_cloudfront_function" "static_cache_headers" {
  name    = "lumigift-${var.env}-static-cache-headers"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-EOT
    async function handler(event) {
      var response = event.response;
      response.headers['cache-control'] = { value: 'public, max-age=31536000, immutable' };
      return response;
    }
  EOT
}

# CloudFront Function: Cache-Control: no-cache, no-store for HTML
resource "aws_cloudfront_function" "html_no_cache_headers" {
  name    = "lumigift-${var.env}-html-no-cache-headers"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-EOT
    async function handler(event) {
      var response = event.response;
      response.headers['cache-control'] = { value: 'no-cache, no-store, must-revalidate' };
      return response;
    }
  EOT
}

# Route 53 alias for CDN
resource "aws_route53_record" "cdn" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.env == "prod" ? "cdn.${var.domain_name}" : "cdn.${var.env}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.app.domain_name
    zone_id                = aws_cloudfront_distribution.app.hosted_zone_id
    evaluate_target_health = false
  }
}

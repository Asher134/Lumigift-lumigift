# Network Security — Firewall Rules & Architecture

> Resolves #375

## Network Diagram

```
Internet
    │
    │  ports 80, 443 only
    ▼
┌─────────────────────────────────────────────────────────────┐
│  Security Group: lumigift-{env}-alb                         │
│  Inbound:  80/tcp  0.0.0.0/0  (HTTP)                        │
│            443/tcp 0.0.0.0/0  (HTTPS)                       │
│  Outbound: 3000/tcp → app SG only                           │
└──────────────────────────┬──────────────────────────────────┘
                           │  port 3000 only
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Security Group: lumigift-{env}-app  (ECS Fargate tasks)    │
│  Inbound:  3000/tcp from ALB SG only                        │
│  Outbound: all (HTTPS to Stellar, Paystack, AWS APIs)       │
└──────────┬──────────────────────────┬───────────────────────┘
           │  port 5432 only          │  port 6379 only
           ▼                          ▼
┌──────────────────────┐   ┌──────────────────────────────────┐
│  SG: lumigift-db     │   │  SG: lumigift-redis              │
│  Inbound:  5432/tcp  │   │  Inbound:  6379/tcp              │
│    from app SG only  │   │    from app SG only              │
│  Outbound: DENY ALL  │   │  Outbound: DENY ALL              │
│                      │   │                                  │
│  RDS PostgreSQL      │   │  ElastiCache Redis               │
│  (private subnet)    │   │  (private subnet)                │
└──────────────────────┘   └──────────────────────────────────┘

VPN/Bastion Access (admin only):
┌─────────────────────────────────────────────────────────────┐
│  Security Group: lumigift-{env}-bastion                     │
│  Inbound:  22/tcp from VPN CIDR only (var.vpn_cidr_blocks)  │
│  Outbound: all → private subnet CIDRs only                  │
└─────────────────────────────────────────────────────────────┘
```

## Security Group Rules Summary

| Security Group | Direction | Port | Source/Dest | Purpose |
|---|---|---|---|---|
| `alb` | Inbound | 80 | 0.0.0.0/0 | HTTP (redirects to HTTPS) |
| `alb` | Inbound | 443 | 0.0.0.0/0 | HTTPS public traffic |
| `alb` | Outbound | 3000 | `app` SG | Forward to containers |
| `app` | Inbound | 3000 | `alb` SG | Receive from ALB only |
| `app` | Outbound | all | 0.0.0.0/0 | External APIs (Stellar, Paystack) |
| `db` | Inbound | 5432 | `app` SG | PostgreSQL from app only |
| `db` | Outbound | — | DENY ALL | DB never initiates connections |
| `redis` | Inbound | 6379 | `app` SG | Redis from app only |
| `redis` | Outbound | — | DENY ALL | Redis never initiates connections |
| `bastion` | Inbound | 22 | VPN CIDR | SSH admin access |
| `bastion` | Outbound | all | Private CIDRs | Access to private resources |

## Key Principles

1. **Database not publicly accessible** — RDS and ElastiCache are in private subnets with security groups that only allow inbound from the `app` security group. No public IP is assigned.

2. **Redis not publicly accessible** — Same as above. ElastiCache cluster is in private subnets.

3. **Only ports 80 and 443 exposed to internet** — The ALB security group is the only resource with public inbound rules, and only on ports 80 and 443.

4. **SSH restricted to VPN/bastion** — The bastion security group only allows SSH (port 22) from `var.vpn_cidr_blocks`. Direct SSH to app containers is not possible (ECS Fargate has no SSH).

5. **Principle of least privilege** — Each security group only allows the minimum traffic required for its function.

## Terraform Variables Required

```hcl
# terraform.tfvars
vpn_cidr_blocks      = ["10.8.0.0/16"]   # Your VPN CIDR
private_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24"]
```

## Verification Checklist

- [ ] `aws ec2 describe-security-groups` confirms no 5432/6379 rules with `0.0.0.0/0`
- [ ] RDS instance has `publicly_accessible = false`
- [ ] ElastiCache cluster has no public endpoint
- [ ] ALB listener on 443 with valid ACM certificate
- [ ] Bastion SSH tested from VPN — succeeds
- [ ] Bastion SSH tested from non-VPN IP — fails

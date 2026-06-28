import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGiftById } from "@/server/services/gift.service";
import React from "react";
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { format } from "date-fns";

// Mask phone: +234***1234
function maskPhone(phone: string): string {
  if (phone.length < 7) return "***";
  return `${phone.slice(0, 4)}***${phone.slice(-4)}`;
}

function formatNGN(n: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(n);
}

const styles = StyleSheet.create({
  page: { padding: 48, fontFamily: "Helvetica", backgroundColor: "#ffffff" },
  header: { marginBottom: 32 },
  brand: { fontSize: 22, fontFamily: "Helvetica-Bold", color: "#6c3bff" },
  tagline: { fontSize: 10, color: "#808090", marginTop: 4 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#e4e4f0", marginVertical: 20 },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#0d0d14", marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#808090", marginBottom: 24 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  label: { fontSize: 10, color: "#808090", width: "40%" },
  value: { fontSize: 10, color: "#0d0d14", fontFamily: "Helvetica-Bold", width: "60%", textAlign: "right" },
  footer: { marginTop: 40, fontSize: 9, color: "#a1a1aa", textAlign: "center" },
  badge: {
    backgroundColor: "#f0ebff",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginBottom: 20,
  },
  badgeText: { fontSize: 9, color: "#6c3bff", fontFamily: "Helvetica-Bold" },
});

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const gift = await getGiftById(id);
  if (!gift) {
    return NextResponse.json({ success: false, error: "Gift not found" }, { status: 404 });
  }

  const userId = (session.user as { id: string }).id;
  if (gift.senderId !== userId) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const generatedAt = format(new Date(), "MMM d, yyyy 'at' h:mm a");
  const unlockDate = format(new Date(gift.unlockAt), "MMM d, yyyy 'at' h:mm a");

  const doc = (
    <Document title={`Lumigift Receipt — ${gift.id}`} author="Lumigift">
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brand}>Lumigift</Text>
          <Text style={styles.tagline}>Time-locked cash gifts on the Stellar blockchain</Text>
        </View>

        <View style={styles.divider} />

        {/* Title */}
        <Text style={styles.title}>Gift Receipt</Text>
        <Text style={styles.subtitle}>Generated {generatedAt}</Text>

        {/* Status badge */}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{gift.status.toUpperCase()}</Text>
        </View>

        {/* Details */}
        <View style={styles.row}>
          <Text style={styles.label}>Gift ID</Text>
          <Text style={styles.value}>{gift.id}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Recipient</Text>
          <Text style={styles.value}>{gift.recipientName}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Recipient Phone</Text>
          <Text style={styles.value}>{maskPhone(gift.recipientPhoneHash.slice(0, 12))}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Amount (NGN)</Text>
          <Text style={styles.value}>{formatNGN(gift.amountNgn)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Amount (USDC)</Text>
          <Text style={styles.value}>{gift.amountUsdc} USDC</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Unlock Date</Text>
          <Text style={styles.value}>{unlockDate}</Text>
        </View>
        {gift.stellarTxHash && (
          <View style={styles.row}>
            <Text style={styles.label}>Stellar Tx Hash</Text>
            <Text style={styles.value}>{gift.stellarTxHash}</Text>
          </View>
        )}
        {gift.occasion && (
          <View style={styles.row}>
            <Text style={styles.label}>Occasion</Text>
            <Text style={styles.value}>{gift.occasion}</Text>
          </View>
        )}

        <View style={styles.divider} />

        <Text style={styles.footer}>
          This receipt is for your records only. Lumigift is not a licensed financial institution.
          {"\n"}For support: support@lumigift.com
        </Text>
      </Page>
    </Document>
  );

  const buffer = await renderToBuffer(doc);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="lumigift-receipt-${gift.id}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

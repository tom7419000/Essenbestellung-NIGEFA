import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

interface SummaryUserRef {
  firstName: string;
  lastName: string;
  email: string;
}

export interface DaySummary {
  dayPlan: {
    date: string;
    status: string;
    organizer: SummaryUserRef | null;
    organizerNote: string | null;
    winnerRestaurant: { name: string; phone: string | null; website: string | null } | null;
  };
  byMenuItem: {
    name: string;
    price: number;
    totalQuantity: number;
    orders: { user: SummaryUserRef; quantity: number; note: string | null }[];
  }[];
  byUser: {
    user: SummaryUserRef;
    lines: { name: string; quantity: number; note: string | null; lineTotal: number }[];
    userTotal: number;
  }[];
  participantCount: number;
  grandTotal: number;
}

const EUR = (value: number) =>
  value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

/** Export der Tagesbestellung als PDF (pdfkit) oder Excel (exceljs). */
@Injectable()
export class ExportService {
  async buildPdf(summary: DaySummary): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(chunks))),
    );

    const restaurant = summary.dayPlan.winnerRestaurant;
    doc.fontSize(18).font('Helvetica-Bold').text('Tagesbestellung — NIGEFA Essensbestellung');
    doc.moveDown(0.3);
    doc
      .fontSize(11)
      .font('Helvetica')
      .text(`Datum: ${summary.dayPlan.date}`)
      .text(`Restaurant: ${restaurant?.name ?? '—'}${restaurant?.phone ? ` · Tel. ${restaurant.phone}` : ''}`)
      .text(
        `Organisator: ${
          summary.dayPlan.organizer
            ? `${summary.dayPlan.organizer.firstName} ${summary.dayPlan.organizer.lastName}`
            : '—'
        }`,
      )
      .text(`Teilnehmer: ${summary.participantCount} · Gesamtsumme: ${EUR(summary.grandTotal)}`);
    if (summary.dayPlan.organizerNote) {
      doc.moveDown(0.3).font('Helvetica-Oblique').text(`Hinweis: ${summary.dayPlan.organizerNote}`);
    }

    doc.moveDown().fontSize(14).font('Helvetica-Bold').text('Bestellung nach Gericht (fürs Restaurant)');
    doc.moveDown(0.3).fontSize(10).font('Helvetica');
    for (const item of summary.byMenuItem) {
      doc
        .font('Helvetica-Bold')
        .text(`${item.totalQuantity}× ${item.name}`, { continued: true })
        .font('Helvetica')
        .text(`  (${EUR(item.price)} / Stück)`);
      for (const order of item.orders) {
        const note = order.note ? ` — ${order.note}` : '';
        doc.text(`    • ${order.quantity}× ${order.user.firstName} ${order.user.lastName}${note}`);
      }
      doc.moveDown(0.2);
    }
    if (summary.byMenuItem.length === 0) doc.text('Keine Bestellungen.');

    doc.moveDown().fontSize(14).font('Helvetica-Bold').text('Nach Person (fürs Einsammeln)');
    doc.moveDown(0.3).fontSize(10);
    for (const entry of summary.byUser) {
      doc
        .font('Helvetica-Bold')
        .text(
          `${entry.user.firstName} ${entry.user.lastName} — ${EUR(entry.userTotal)}`,
        );
      doc.font('Helvetica');
      for (const line of entry.lines) {
        const note = line.note ? ` — ${line.note}` : '';
        doc.text(`    ${line.quantity}× ${line.name}${note} (${EUR(line.lineTotal)})`);
      }
      doc.moveDown(0.2);
    }

    doc.end();
    return finished;
  }

  async buildXlsx(summary: DaySummary): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'NIGEFA Essensbestellung';

    const infoSheet = workbook.addWorksheet('Übersicht');
    infoSheet.columns = [
      { header: '', key: 'key', width: 22 },
      { header: '', key: 'value', width: 50 },
    ];
    infoSheet.addRows([
      { key: 'Datum', value: summary.dayPlan.date },
      { key: 'Restaurant', value: summary.dayPlan.winnerRestaurant?.name ?? '—' },
      { key: 'Telefon', value: summary.dayPlan.winnerRestaurant?.phone ?? '—' },
      {
        key: 'Organisator',
        value: summary.dayPlan.organizer
          ? `${summary.dayPlan.organizer.firstName} ${summary.dayPlan.organizer.lastName}`
          : '—',
      },
      { key: 'Teilnehmer', value: summary.participantCount },
      { key: 'Gesamtsumme (€)', value: summary.grandTotal },
      { key: 'Hinweis', value: summary.dayPlan.organizerNote ?? '' },
    ]);

    const itemSheet = workbook.addWorksheet('Nach Gericht');
    itemSheet.columns = [
      { header: 'Anzahl', key: 'quantity', width: 10 },
      { header: 'Gericht', key: 'name', width: 40 },
      { header: 'Einzelpreis (€)', key: 'price', width: 15 },
      { header: 'Besteller', key: 'user', width: 30 },
      { header: 'Bemerkung', key: 'note', width: 40 },
    ];
    itemSheet.getRow(1).font = { bold: true };
    for (const item of summary.byMenuItem) {
      itemSheet.addRow({
        quantity: item.totalQuantity,
        name: item.name,
        price: item.price,
        user: '— gesamt —',
        note: '',
      }).font = { bold: true };
      for (const order of item.orders) {
        itemSheet.addRow({
          quantity: order.quantity,
          name: item.name,
          price: item.price,
          user: `${order.user.firstName} ${order.user.lastName}`,
          note: order.note ?? '',
        });
      }
    }

    const userSheet = workbook.addWorksheet('Nach Person');
    userSheet.columns = [
      { header: 'Person', key: 'user', width: 30 },
      { header: 'Anzahl', key: 'quantity', width: 10 },
      { header: 'Gericht', key: 'name', width: 40 },
      { header: 'Bemerkung', key: 'note', width: 40 },
      { header: 'Summe (€)', key: 'total', width: 12 },
    ];
    userSheet.getRow(1).font = { bold: true };
    for (const entry of summary.byUser) {
      for (const [index, line] of entry.lines.entries()) {
        userSheet.addRow({
          user: index === 0 ? `${entry.user.firstName} ${entry.user.lastName}` : '',
          quantity: line.quantity,
          name: line.name,
          note: line.note ?? '',
          total: line.lineTotal,
        });
      }
      userSheet.addRow({ user: '', quantity: '', name: '', note: 'Zwischensumme', total: entry.userTotal }).font =
        { bold: true };
    }
    userSheet.addRow({});
    userSheet.addRow({ note: 'GESAMT', total: summary.grandTotal }).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as ArrayBuffer);
  }
}

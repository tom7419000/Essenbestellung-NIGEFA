import { NotificationType } from '../../database/entities/enums';

export interface NotificationParams {
  restaurantName?: string;
  deadlineTime?: string; // z. B. "11:30"
  date?: string; // formatiert
  note?: string;
  status?: string;
  count?: number;
}

type Texts = { title: string; message: string };

/** Lokalisierte Titel/Nachrichten für In-App, E-Mail und Push (de/en). */
export function notificationTexts(
  type: NotificationType,
  locale: string,
  p: NotificationParams,
): Texts {
  const de = locale !== 'en';
  switch (type) {
    case NotificationType.VOTING_OPENED:
      return de
        ? {
            title: 'Restaurant-Abstimmung gestartet',
            message: `Stimme bis ${p.deadlineTime} Uhr ab, wo heute bestellt wird.`,
          }
        : {
            title: 'Restaurant vote started',
            message: `Vote until ${p.deadlineTime} on where to order today.`,
          };
    case NotificationType.VOTING_REMINDER:
      return de
        ? {
            title: 'Erinnerung: Abstimmung endet bald',
            message: `Du hast noch nicht abgestimmt — die Restaurant-Wahl endet um ${p.deadlineTime} Uhr.`,
          }
        : {
            title: 'Reminder: vote closing soon',
            message: `You haven't voted yet — the restaurant vote closes at ${p.deadlineTime}.`,
          };
    case NotificationType.RUNOFF_STARTED:
      return de
        ? {
            title: 'Stichwahl!',
            message: `Gleichstand — stimme bis ${p.deadlineTime} Uhr in der Stichwahl ab.`,
          }
        : {
            title: 'Runoff vote!',
            message: `It's a tie — cast your runoff vote until ${p.deadlineTime}.`,
          };
    case NotificationType.WINNER_ANNOUNCED:
      return de
        ? {
            title: `${p.restaurantName} hat gewonnen!`,
            message: `Die Essensbestellung läuft jetzt — wähle dein Gericht bis ${p.deadlineTime} Uhr.`,
          }
        : {
            title: `${p.restaurantName} won!`,
            message: `Meal ordering is open — pick your dish until ${p.deadlineTime}.`,
          };
    case NotificationType.ORDERING_REMINDER:
      return de
        ? {
            title: 'Erinnerung: Bestellung endet bald',
            message: `Du hast noch nichts bestellt — die Bestellung bei ${p.restaurantName} endet um ${p.deadlineTime} Uhr.`,
          }
        : {
            title: 'Reminder: ordering closes soon',
            message: `You haven't ordered yet — ordering from ${p.restaurantName} closes at ${p.deadlineTime}.`,
          };
    case NotificationType.TIE_ADMIN_ACTION:
      return de
        ? {
            title: 'Gleichstand — Entscheidung nötig',
            message: 'Die Restaurant-Abstimmung endete unentschieden. Bitte lege den Gewinner fest.',
          }
        : {
            title: 'Tie — decision required',
            message: 'The restaurant vote ended in a tie. Please pick the winner.',
          };
    case NotificationType.ORGANIZER_REMINDER:
      return de
        ? {
            title: 'Bestellung kann aufgegeben werden',
            message: `Die Bestellfrist ist vorbei: ${p.count ?? 0} Person(en) haben bei ${p.restaurantName} bestellt. Bitte gib die Bestellung auf.`,
          }
        : {
            title: 'Ready to place the order',
            message: `Ordering has closed: ${p.count ?? 0} people ordered from ${p.restaurantName}. Please place the order.`,
          };
    case NotificationType.ORDER_STATUS_CHANGED:
      if (p.status === 'ORDERED') {
        return de
          ? {
              title: 'Bestellung ist raus 🛵',
              message: `Die Bestellung bei ${p.restaurantName} wurde aufgegeben.${p.note ? ` Hinweis: ${p.note}` : ''}`,
            }
          : {
              title: 'Order placed 🛵',
              message: `The order at ${p.restaurantName} has been placed.${p.note ? ` Note: ${p.note}` : ''}`,
            };
      }
      return de
        ? {
            title: 'Essen ist da! 🍽️',
            message: `Die Lieferung von ${p.restaurantName} ist eingetroffen.${p.note ? ` Hinweis: ${p.note}` : ''}`,
          }
        : {
            title: 'Food has arrived! 🍽️',
            message: `The delivery from ${p.restaurantName} has arrived.${p.note ? ` Note: ${p.note}` : ''}`,
          };
    case NotificationType.DAY_CANCELLED:
      return de
        ? {
            title: 'Heute keine Bestellung',
            message: p.note ?? 'Die heutige Essensbestellung wurde abgesagt.',
          }
        : {
            title: 'No order today',
            message: p.note ?? "Today's meal ordering has been cancelled.",
          };
    default:
      return de
        ? { title: 'Benachrichtigung', message: p.note ?? '' }
        : { title: 'Notification', message: p.note ?? '' };
  }
}

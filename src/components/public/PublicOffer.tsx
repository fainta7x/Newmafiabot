import type { ReactNode } from 'react';
import { LEGAL_INFO } from '../../lib/legalInfo.ts';

const Section = ({ id, title, children }: { id: string; title: string; children: ReactNode }) => (
  <section id={id} className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
    <h2 className="text-[16px] font-bold">{title}</h2>
    <div className="space-y-2 text-[14px] leading-6 text-white/80">{children}</div>
  </section>
);

/**
 * The public page the payment provider's moderation asks for: services and prices, contacts, ordering, payment, delivery,
 * refund steps, the seller's details and the personal data policy. No login, no app chrome.
 */
export function PublicOffer() {
  const mail = <a className="font-semibold text-sky-300 underline underline-offset-2" href={`mailto:${LEGAL_INFO.email}`}>{LEGAL_INFO.email}</a>;
  return (
    <main data-testid="public-offer" className="min-h-screen bg-[#090a0d] px-4 py-7 text-white">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="space-y-1">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-white/45">{LEGAL_INFO.club}</p>
          <h1 className="text-[24px] font-bold leading-tight">Условия, оплата и контакты</h1>
          <p className="text-[13px] text-white/60">Клуб игры «Мафия» в Туле.</p>
        </header>

        <Section id="services" title="Что мы предлагаем и сколько это стоит">
          <p>Участие в игровом вечере клуба {LEGAL_INFO.club}: живые игры в «Мафию» с ведущим. Проходят очно по адресу: {LEGAL_INFO.venue}. Дата и время каждого вечера указаны в анонсе.</p>
          <p><strong>Стоимость:</strong> 100 ₽ за каждую сыгранную игру, но не больше 400 ₽ за весь вечер. Для турниров и особых вечеров цена указана в их анонсе.</p>
        </Section>

        <Section id="order" title="Как записаться">
          <p>Выберите вечер в приложении клуба (в Telegram или ВКонтакте) и нажмите «Иду». Запись бесплатная. Передумали — нажмите «Не иду» или напишите нам, запись отменится без последствий.</p>
        </Section>

        <Section id="payment" title="Оплата">
          <p>Вы платите после игр, за те игры, которые сыграли. Оплатить можно картой или через СБП онлайн, либо переводом организатору на месте. Чек самозанятого придёт на ваш контакт.</p>
        </Section>

        <Section id="delivery" title="Как оказывается услуга">
          <p>Вы приходите на вечер в назначенное время и играете. Если вечер переносится или отменяется, мы заранее сообщаем об этом в приложении.</p>
        </Section>

        <Section id="refund" title="Отказ и возврат денег">
          <p>Так как оплата после игр, до вечера вы ничего не платите. Если вы заплатили заранее (например, за турнир) или вас списали по ошибке, деньги можно вернуть:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Напишите на {mail}: имя или ник, дата вечера и как платили.</li>
            <li>Мы ответим в течение 3 рабочих дней.</li>
            <li>Деньги вернутся на ту же карту или счёт в течение 10 рабочих дней.</li>
          </ol>
          <p>До начала вечера возвращаем всю сумму. Если вечер отменили мы — тоже всю сумму. Комиссию платёжного сервиса или банка мы не вычитаем.</p>
        </Section>

        <Section id="contacts" title="Контакты и реквизиты">
          <ul className="space-y-1">
            <li><strong>Исполнитель:</strong> {LEGAL_INFO.fullName}, {LEGAL_INFO.status}</li>
            <li><strong>ИНН:</strong> {LEGAL_INFO.inn}</li>
            <li><strong>Почта:</strong> {mail}</li>
            <li><strong>Адрес вечеров:</strong> {LEGAL_INFO.venue}</li>
          </ul>
        </Section>

        <Section id="privacy" title="Персональные данные">
          <p>Мы храним ваш ник и имя, контакт в Telegram или ВКонтакте (и телефон, если вы его указали), историю игр и оплат. Нужно это только для записи на вечера, игр, связи с вами и оплаты. Данные банковской карты мы не видим — их принимает платёжный сервис.</p>
          <p>Мы не продаём данные и передаём их только Telegram, ВКонтакте и платёжному сервису в объёме, нужном для работы, или по закону. Хотите удалить или исправить данные, либо отозвать согласие — напишите на {mail}, сделаем в течение 30 дней.</p>
        </Section>

        <p className="pb-6 text-center text-[12px] text-white/40">{LEGAL_INFO.club} · {LEGAL_INFO.fullName} · ИНН {LEGAL_INFO.inn}</p>
      </div>
    </main>
  );
}

export default PublicOffer;

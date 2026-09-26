package com.fyp.backend.jobs;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.fyp.backend.service.EventRegistrationService;
import com.fyp.backend.service.EventRegistrationService.ReminderBatch;
import com.fyp.backend.service.LocalizedText;
import com.fyp.backend.service.PushMessages;
import com.fyp.backend.service.PushNotificationService;

/**
 * Pushes "starting soon" to everyone registered for an event, once, about
 * {@code events.reminder.lead-minutes} before it starts.
 *
 * Polls rather than scheduling a timer per event: events get edited and
 * rescheduled, and a poll over a (start_at, reminder_sent_at) window simply
 * picks up whatever is due now. A reschedule clears the marker, so the new time
 * is reminded too. Mirrors the existing scheduled-job pattern
 * ({@code PushTokenCleanupJob}).
 */
@Component
public class EventReminderJob {

    private static final Logger log = LoggerFactory.getLogger(EventReminderJob.class);

    @Autowired private EventRegistrationService registrationService;
    @Autowired private PushNotificationService pushNotificationService;
    @Autowired private PushMessages pushMessages;

    @Scheduled(initialDelayString = "${events.reminder.initial-delay-ms:60000}",
            fixedDelayString = "${events.reminder.poll-ms:300000}")
    public void sendDueReminders() {
        for (ReminderBatch batch : registrationService.claimDueReminders()) {
            pushNotificationService.notifyEventReminder(batch.userIds(), batch.eventId(),
                    pushMessages.text("push.event.reminder.title"), body(batch));
            log.info("Sent start reminder for event {} to {} registrant(s)", batch.eventId(), batch.userIds().size());
        }
    }

    LocalizedText body(ReminderBatch batch) {
        String title = batch.title() == null ? "" : batch.title().trim();
        String time = batch.startTime() == null ? "" : batch.startTime().trim();
        String location = batch.location() == null ? "" : batch.location().trim();
        return location.isEmpty()
                ? pushMessages.text("push.event.reminder.body.noLocation", title, time)
                : pushMessages.text("push.event.reminder.body", title, time, location);
    }
}

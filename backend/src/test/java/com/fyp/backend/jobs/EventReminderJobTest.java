package com.fyp.backend.jobs;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.test.util.ReflectionTestUtils;

import com.fyp.backend.service.EventRegistrationService;
import com.fyp.backend.service.EventRegistrationService.ReminderBatch;
import com.fyp.backend.service.LocalizedText;
import com.fyp.backend.service.PushMessages;
import com.fyp.backend.service.PushNotificationService;

class EventReminderJobTest {

    private final EventRegistrationService registrationService = mock(EventRegistrationService.class);
    private final PushNotificationService push = mock(PushNotificationService.class);
    private final PushMessages pushMessages = realPushMessages();
    private final EventReminderJob job = new EventReminderJob();

    EventReminderJobTest() {
        ReflectionTestUtils.setField(job, "registrationService", registrationService);
        ReflectionTestUtils.setField(job, "pushNotificationService", push);
        ReflectionTestUtils.setField(job, "pushMessages", pushMessages);
    }

    @Test
    void remindsEachEventsRegistrantsInTheirOwnLanguage() {
        when(registrationService.claimDueReminders()).thenReturn(List.of(
                new ReminderBatch(9L, "Sunday Service", "10:00 AM", "Main Hall", List.of(7L, 8L))));

        job.sendDueReminders();

        ArgumentCaptor<LocalizedText> title = ArgumentCaptor.forClass(LocalizedText.class);
        ArgumentCaptor<LocalizedText> body = ArgumentCaptor.forClass(LocalizedText.class);
        verify(push).notifyEventReminder(eq(List.of(7L, 8L)), eq(9L), title.capture(), body.capture());
        assertEquals("Event starting soon", title.getValue().render("en"));
        assertEquals("活动即将开始", title.getValue().render("zh"));
        assertEquals("\"Sunday Service\" starts at 10:00 AM — Main Hall", body.getValue().render("en"));
        assertEquals("您报名的「Sunday Service」将于 10:00 AM 开始，地点：Main Hall", body.getValue().render("zh"));
    }

    @Test
    void leavesTheLocationOutWhenThereIsNone() {
        LocalizedText body = job.body(new ReminderBatch(9L, "Prayer", "7:30 PM", " ", List.of(7L)));

        assertEquals("\"Prayer\" starts at 7:30 PM", body.render("en"));
        assertEquals("您报名的「Prayer」将于 7:30 PM 开始", body.render("zh"));
    }

    /** The shipped messages*.properties, configured as Spring Boot configures them. */
    private static PushMessages realPushMessages() {
        ResourceBundleMessageSource source = new ResourceBundleMessageSource();
        source.setBasename("messages");
        source.setDefaultEncoding("UTF-8");
        source.setFallbackToSystemLocale(false);
        return new PushMessages(source);
    }

    @Test
    void doesNothingWhenNothingIsDue() {
        when(registrationService.claimDueReminders()).thenReturn(List.of());

        job.sendDueReminders();

        verify(push, org.mockito.Mockito.never()).notifyEventReminder(any(), any(), any(), any());
    }
}

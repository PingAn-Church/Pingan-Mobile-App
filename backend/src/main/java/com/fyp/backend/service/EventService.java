package com.fyp.backend.service;

import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;

import com.fyp.backend.dto.EventDto;
import com.fyp.backend.model.Event;
import com.fyp.backend.repository.EventRepository;

@Service
public class EventService {

    @Autowired
    private EventRepository eventRepository;

    // Fetch all events
    public List<Event> getAllEvents() {
        return eventRepository.findAll();
    }

    // Fetch a single event by ID
    public Optional<Event> getEventById(Long id) {
        return eventRepository.findById(id);
    }

    // Create a new event
    public Event createEvent(EventDto eventDto) {
        Event event = new Event(
                eventDto.getTitle(),
                eventDto.getDescription(),
                eventDto.getDate(),
                eventDto.getStartTime(),
                eventDto.getEndTime(),
                eventDto.getLocation()
        );
        return eventRepository.save(event);
    }

    // Check-in a user to an event
    public boolean checkInUser(Long eventId, Long userId) {
        Optional<Event> optionalEvent = eventRepository.findById(eventId);
        if (optionalEvent.isPresent()) {
            Event event = optionalEvent.get();
            if (!event.getCheckedInUserIds().contains(userId)) {
                event.getCheckedInUserIds().add(userId);
                eventRepository.save(event);
                return true;
            }
        }
        return false;
    }

    public Event updateEvent(Long id, EventDto eventDto) {
        Event event = eventRepository.findById(id).orElseThrow(() -> new RuntimeException("Event not found"));
    
        event.setTitle(eventDto.getTitle());
        event.setDescription(eventDto.getDescription());
        event.setDate(eventDto.getDate());
        event.setStartTime(eventDto.getStartTime());
        event.setEndTime(eventDto.getEndTime());
        event.setLocation(eventDto.getLocation());
    
        return eventRepository.save(event);
    }
    
    public void deleteEvent(Long id) {
        if (!eventRepository.existsById(id)) {
            throw new RuntimeException("Event not found");
        }
        eventRepository.deleteById(id);
    }
    
}

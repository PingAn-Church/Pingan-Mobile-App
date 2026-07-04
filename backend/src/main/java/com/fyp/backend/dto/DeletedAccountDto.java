package com.fyp.backend.dto;

import java.time.Instant;
import java.util.Map;

import com.fyp.backend.model.User;

public class DeletedAccountDto {

    private Long id;
    private String displayName;
    private String email;
    private Instant deletedAt;
    private Map<String, Long> references;
    private long referenceCount;
    private boolean purgeEligible;

    public static DeletedAccountDto from(User user, Map<String, Long> references) {
        DeletedAccountDto dto = new DeletedAccountDto();
        dto.id = user.getId();
        dto.displayName = "Deleted Account";
        dto.email = user.getEmail();
        dto.deletedAt = user.getDeletedAt();
        dto.references = references;
        dto.referenceCount = references.values().stream().mapToLong(Long::longValue).sum();
        dto.purgeEligible = dto.referenceCount == 0;
        return dto;
    }

    public Long getId() {
        return id;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getEmail() {
        return email;
    }

    public Instant getDeletedAt() {
        return deletedAt;
    }

    public Map<String, Long> getReferences() {
        return references;
    }

    public long getReferenceCount() {
        return referenceCount;
    }

    public boolean isPurgeEligible() {
        return purgeEligible;
    }
}
